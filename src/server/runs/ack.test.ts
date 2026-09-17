import { describe, expect, it } from "vitest";

import {
  ackAfterWrite,
  ackThroughRawSeq,
  isSamePayload,
  planAppend,
  type KeyedPayload,
  type StoredPayload,
} from "./ack";

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

/** 저장된 행 · 새로 온 점. `rawSeq` 만 다르게 주고 값은 `payload()` 를 쓴다. */
function point(rawSeq: number, overrides: Partial<StoredPayload> = {}): KeyedPayload {
  return { rawSeq, ...payload(overrides) };
}

describe("planAppend", () => {
  it("저장된 점이 없으면 전부 새로 쓴다", () => {
    expect(planAppend([], [point(1), point(2)])).toEqual({
      kind: "write",
      fresh: [point(1), point(2)],
    });
  });

  it("같은 값이 다시 오면 멱등하다 — 쓸 것이 없고 충돌도 아니다", () => {
    expect(planAppend([point(1), point(2)], [point(1), point(2)])).toEqual({
      kind: "write",
      fresh: [],
    });
  });

  it("이미 저장된 점과 새 점이 섞이면 새 점만 쓴다", () => {
    expect(planAppend([point(1)], [point(1), point(2), point(3)])).toEqual({
      kind: "write",
      fresh: [point(2), point(3)],
    });
  });

  it("저장된 키에 다른 값이 오면 충돌이다", () => {
    expect(planAppend([point(1)], [point(1, { lat: 37.5 })])).toEqual({
      kind: "conflict",
      rawSeq: 1,
    });
  });

  it("충돌이 하나라도 있으면 같은 배치의 새 점도 쓰지 않는다 — 일부만 저장하지 않는다", () => {
    // 2 · 3 은 새 점이지만, 1 이 충돌이므로 배치 전체가 거절된다.
    const plan = planAppend([point(1)], [point(2), point(1, { lat: 37.5 }), point(3)]);

    expect(plan).toEqual({ kind: "conflict", rawSeq: 1 });
    expect(plan).not.toHaveProperty("fresh");
  });

  it("충돌은 입력 순서상 처음 걸린 점을 알려 준다", () => {
    expect(
      planAppend(
        [point(1), point(2)],
        [point(2, { lng: 127.2 }), point(1, { lat: 37.5 })],
      ),
    ).toEqual({ kind: "conflict", rawSeq: 2 });
  });

  it("한 배치 안에서 같은 번호가 같은 값으로 두 번 오면 하나만 쓴다", () => {
    expect(planAppend([], [point(1), point(1), point(2)])).toEqual({
      kind: "write",
      fresh: [point(1), point(2)],
    });
  });

  it("한 배치 안에서 같은 번호가 다른 값으로 오면 충돌이다 — 하나를 조용히 버리지 않는다", () => {
    // 전에는 둘 다 fresh 로 INSERT 에 들어가 두 번째가 ON CONFLICT DO NOTHING 으로 사라지고
    // ACK 는 1 을 저장했다고 답했다.
    expect(planAppend([], [point(1), point(1, { recordedAt: 1_760_000_020_000 })])).toEqual({
      kind: "conflict",
      rawSeq: 1,
    });
  });
});

describe("ackAfterWrite", () => {
  it("저장돼 있던 번호와 새로 들어간 번호를 이어서 센다", () => {
    expect(ackAfterWrite([1, 2], [3, 4])).toBe(4);
  });

  it("넣으려던 번호가 실제로 들어가지 않았으면 ACK 하지 않는다", () => {
    // 3 · 4 를 넣으려 했지만 RETURNING 에는 3 만 왔다 — 4 를 저장됐다고 말하지 않는다.
    expect(ackAfterWrite([1, 2], [3])).toBe(3);
  });

  it("순서 없이 들어와도 맞게 센다", () => {
    expect(ackAfterWrite([2, 1], [4, 3])).toBe(4);
  });

  it("빈 자리가 있으면 거기서 멈춘다", () => {
    expect(ackAfterWrite([1, 2], [4, 5])).toBe(2);
  });

  it("아무것도 없으면 0 이다", () => {
    expect(ackAfterWrite([], [])).toBe(0);
  });
});
