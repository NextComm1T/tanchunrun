import { describe, expect, it } from "vitest";

import { declaresTooLarge, readBodyWithLimit } from "./bodyLimit";

/**
 * 조각을 하나씩 내보내는 스트림. **몇 조각을 당겨 갔는지** 센다 — 상한을 넘은 뒤 나머지를
 * 정말 읽지 않는지가 이 규칙의 핵심이다.
 */
function streamOf(chunks: Uint8Array[]) {
  let pulled = 0;
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled === chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[pulled]);
      pulled += 1;
    },
    cancel() {
      cancelled = true;
    },
  });

  return {
    stream,
    get pulled() {
      return pulled;
    },
    get cancelled() {
      return cancelled;
    },
  };
}

function bytes(size: number): Uint8Array {
  return new Uint8Array(size).fill(0x61); // "a"
}

describe("readBodyWithLimit", () => {
  it("상한 이내면 본문 전체를 문자열로 돌려준다", async () => {
    const encoded = new TextEncoder().encode('{"points":[]}');
    const source = streamOf([encoded]);

    await expect(readBodyWithLimit(source.stream, 1024)).resolves.toEqual({
      ok: true,
      text: '{"points":[]}',
    });
  });

  it("정확히 상한 크기는 받는다", async () => {
    const source = streamOf([bytes(60), bytes(40)]);

    const result = await readBodyWithLimit(source.stream, 100);

    expect(result).toEqual({ ok: true, text: "a".repeat(100) });
  });

  it("상한을 1 byte 라도 넘으면 거절한다", async () => {
    const source = streamOf([bytes(60), bytes(41)]);

    await expect(readBodyWithLimit(source.stream, 100)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("상한을 넘는 순간 멈추고 나머지 조각을 당기지 않는다 — 전부 읽고 재지 않는다", async () => {
    // 64 byte 조각 16개(1024 byte) 중 상한 256 을 넘기는 것은 5번째 조각이다.
    const source = streamOf(Array.from({ length: 16 }, () => bytes(64)));

    const result = await readBodyWithLimit(source.stream, 256);

    expect(result).toEqual({ ok: false, reason: "too_large" });
    expect(source.pulled).toBeLessThan(16);
    expect(source.pulled).toBeLessThanOrEqual(6);
    expect(source.cancelled).toBe(true);
  });

  it("여러 바이트짜리 글자가 조각 경계에서 갈려도 올바르게 디코드한다", async () => {
    const encoded = new TextEncoder().encode("탄천");
    // "탄" 의 3 byte 를 두 조각에 나눠 보낸다.
    const source = streamOf([encoded.slice(0, 2), encoded.slice(2)]);

    await expect(readBodyWithLimit(source.stream, 1024)).resolves.toEqual({
      ok: true,
      text: "탄천",
    });
  });

  it("상한은 글자 수가 아니라 byte 로 센다", async () => {
    // "탄천" 은 2 글자지만 6 byte 다.
    const source = streamOf([new TextEncoder().encode("탄천")]);

    await expect(readBodyWithLimit(source.stream, 5)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("본문이 없으면 빈 문자열이다 — 형식 오류 판정은 호출부의 JSON.parse 가 한다", async () => {
    await expect(readBodyWithLimit(null, 1024)).resolves.toEqual({
      ok: true,
      text: "",
    });
  });

  it("읽는 도중 스트림이 깨지면 unreadable 이다", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("connection reset"));
      },
    });

    await expect(readBodyWithLimit(stream, 1024)).resolves.toEqual({
      ok: false,
      reason: "unreadable",
    });
  });
});

describe("declaresTooLarge", () => {
  it("선언된 크기가 상한을 넘으면 true", () => {
    expect(declaresTooLarge("262145", 262_144)).toBe(true);
  });

  it("선언된 크기가 상한 이내면 false — 믿지는 않고 실제 읽기에서 다시 센다", () => {
    expect(declaresTooLarge("262144", 262_144)).toBe(false);
    expect(declaresTooLarge("10", 262_144)).toBe(false);
  });

  it("헤더가 없으면 false — chunked 전송에는 Content-Length 가 없다", () => {
    expect(declaresTooLarge(null, 262_144)).toBe(false);
  });

  it("숫자가 아니면 판정하지 않는다", () => {
    expect(declaresTooLarge("abc", 262_144)).toBe(false);
    expect(declaresTooLarge("-1", 262_144)).toBe(false);
    expect(declaresTooLarge("1e9", 262_144)).toBe(false);
    expect(declaresTooLarge("", 262_144)).toBe(false);
  });
});
