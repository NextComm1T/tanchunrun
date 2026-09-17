/**
 * 요청 본문을 상한까지만 읽는 규칙(#115).
 *
 * **`import "server-only"` 를 붙이지 않는다.** `ack.ts` 와 같은 이유다 — DB · cookie · `node:`
 * 모듈을 쓰지 않아서, 상한을 넘는 순간 정말 멈추는지 테스트로 확인할 수 있어야 한다.
 *
 * ## 왜 `request.text()` 를 쓰지 않는가
 *
 * `text()` · `json()` 은 본문을 **끝까지 읽은 뒤에야** 돌려준다. 그 뒤에 크기를 재면 상한은
 * 이미 메모리에 다 올라온 다음이라 자원 보호가 되지 못한다. 여기서는 조각을 받을 때마다 누적
 * 크기를 보고, 넘는 순간 스트림을 취소해 **나머지를 읽지 않는다.**
 *
 * 이것이 실제로 효과가 있는 것은 Next 16 이 route handler 에 원본 Node 스트림을 그대로 넘기기
 * 때문이다 — 확인한 내용은 #115 에 적었다.
 *
 * ## `Content-Length` 는 먼저 보되 믿지 않는다
 *
 * 헤더가 상한을 넘는다고 **선언**하면 읽기 전에 바로 거절한다(비용 0). 하지만 chunked 전송에는
 * 헤더가 없고 값은 거짓일 수 있으므로, 헤더가 괜찮다고 해도 실제 읽기에서 다시 센다.
 */

export type BoundedBody =
  | { ok: true; text: string }
  /** 상한을 넘었다. 나머지는 읽지 않았다. */
  | { ok: false; reason: "too_large" }
  /** 읽는 도중 스트림이 깨졌다(client 가 연결을 끊는 등). */
  | { ok: false; reason: "unreadable" };

/**
 * `Content-Length` 가 상한을 넘는다고 **선언**하는가.
 *
 * 헤더가 없거나 숫자가 아니면 `false` 다 — 판정할 근거가 없으니 실제 읽기에 맡긴다.
 * 선언이 상한 이내여도 믿지 않는다(`readBodyWithLimit` 가 다시 센다).
 */
export function declaresTooLarge(
  contentLength: string | null,
  maxBytes: number,
): boolean {
  if (contentLength === null || !/^\d+$/.test(contentLength.trim())) return false;

  return Number(contentLength.trim()) > maxBytes;
}

/**
 * 본문을 `maxBytes` 까지만 읽어 UTF-8 문자열로 돌려준다.
 *
 * 정확히 `maxBytes` 는 받는다. 넘는 순간 스트림을 취소하고 `too_large` 다.
 * 본문이 없으면 빈 문자열이다 — `JSON.parse("")` 가 실패하므로 호출부에서 형식 오류가 된다.
 *
 * 조각은 모았다가 **한 번만** 합치고 한 번만 디코드한다. 크기를 재려고 문자열을 다시 인코딩해
 * 사본을 하나 더 만들지 않는다.
 */
export async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<BoundedBody> {
  if (body === null) return { ok: true, text: "" };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > maxBytes) {
        // 나머지를 당기지 않는다. 취소가 실패해도 이미 거절하기로 했으니 결과는 같다.
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }

      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // `request.text()` 와 같이 잘못된 바이트는 대체 문자로 바꾼다(fatal 아님).
  return { ok: true, text: new TextDecoder().decode(joined) };
}
