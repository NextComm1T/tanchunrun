import { describe, expect, it } from "vitest";

import { ackThroughRawSeq, isSamePayload, type StoredPayload } from "./ack";

/** 실제로 저장되는 한 점. 값 자체는 뜻이 없고 **무엇이 다르면 충돌인지**가 중요하다. */
function payload(overrides: Partial<StoredPayload> = {}): StoredPayload {
  return {
    segment: 0,
    lat: 37.4842822,
    lng: 127.1121213,
    recordedAt: 1_760_000_010_000,
    accuracy: 8,
    ...overrides,
  };
}

describe("ackThroughRawSeq", () => {
  it("점이 없으면 0 이다 — rawSeq 는 1 부터 시작한다(D11)", () => {
    expect(ackThroughRawSeq([])).toBe(0);
  });

  it("연속으로 들어온 만큼 전진한다", () => {
    expect(ackThroughRawSeq([1, 2, 3])).toBe(3);
  });

  it("중간에 빈 자리가 있으면 거기서 멈춘다 — max 가 아니다", () => {
    // 서버에 1,2,4,5 가 있어도 3 이 비어 있으면 ACK 는 2 다.
    expect(ackThroughRawSeq([1, 2, 4, 5])).toBe(2);
  });

  it("gap 이 메워지면 끝까지 전진한다", () => {
    expect(ackThroughRawSeq([1, 2, 3, 4, 5])).toBe(5);
  });

  it("1 이 없으면 아무것도 ACK 하지 않는다", () => {
    expect(ackThroughRawSeq([2, 3, 4])).toBe(0);
  });

  it("같은 번호가 겹쳐 들어와도 흔들리지 않는다", () => {
    expect(ackThroughRawSeq([1, 1, 2, 2, 3])).toBe(3);
  });
});

describe("isSamePayload", () => {
  it("같은 값이면 멱등 — 재전송은 성공이다", () => {
    expect(isSamePayload(payload(), payload())).toBe(true);
  });

  it("좌표 · 시각 · segment · accuracy 중 하나라도 다르면 충돌이다", () => {
    const cases: Partial<StoredPayload>[] = [
      { lat: 37.4842823 },
      { lng: 127.1121214 },
      { recordedAt: 1_760_000_010_001 },
      { segment: 1 },
      { accuracy: 9 },
    ];

    for (const overrides of cases) {
      expect(isSamePayload(payload(), payload(overrides))).toBe(false);
    }
  });

  it("accuracy 의 null 과 undefined 는 같은 「없음」이다", () => {
    expect(
      isSamePayload(
        payload({ accuracy: null }),
        payload({ accuracy: undefined as unknown as null }),
      ),
    ).toBe(true);
  });

  it("accuracy 가 있다가 없어지면 충돌이다", () => {
    expect(isSamePayload(payload({ accuracy: 8 }), payload({ accuracy: null })))
      .toBe(false);
  });
});
