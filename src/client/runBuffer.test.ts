import { describe, expect, it } from "vitest";

import {
  finishLastRawSeq,
  partitionPointStream,
  type BufferedPoint,
  type TerminalTombstone,
} from "./runBuffer";

/**
 * 종료 때 서버에 말하는 「여기까지 빠짐없이 올렸다」(#145).
 *
 * 서버는 `1..lastRawSeq` 가 연속으로 저장돼 있어야 종료를 받는다. 서버가 영영 받지 않는 점이
 * 생기면 그 앞까지만 말해야 종료가 막히지 않는다.
 */
describe("finishLastRawSeq", () => {
  it("버린 점이 없으면 마지막으로 부여한 번호다", () => {
    expect(finishLastRawSeq(11, [])).toBe(10);
  });

  it("점이 하나도 없으면 0 이다", () => {
    expect(finishLastRawSeq(1, [])).toBe(0);
  });

  it("버린 번호가 있으면 그 바로 앞까지다", () => {
    expect(finishLastRawSeq(11, [4])).toBe(3);
  });

  it("여러 개를 버렸으면 가장 이른 빈 자리 앞까지다", () => {
    expect(finishLastRawSeq(11, [7, 4, 9])).toBe(3);
  });

  it("첫 점을 버렸으면 0 이다 — 점 0개 종료와 같다", () => {
    expect(finishLastRawSeq(5, [1])).toBe(0);
  });

  it("아직 부여하지 않은 번호나 0 이하는 무시한다", () => {
    expect(finishLastRawSeq(5, [9])).toBe(4);
    expect(finishLastRawSeq(5, [0])).toBe(4);
  });
});

/**
 * points store 에서 읽은 것을 가르는 규칙(#164 · D11 2차).
 *
 * 세 reader 와 「다음 `rawSeq`」 계산이 전부 이 한 곳을 본다. 여기가 틀리면
 * **영영 거절된 번호를 다른 점에 다시 부여**하거나, **tombstone 을 서버로 다시 올려** 같은
 * 400 을 영원히 받는다.
 */
describe("partitionPointStream", () => {
  it("비어 있으면 전부 비어 있고 max 는 0 이다", () => {
    expect(partitionPointStream([])).toEqual({
      points: [],
      terminalRawSeqs: [],
      maxRawSeq: 0,
    });
  });

  it("tombstone 은 업로드 대상에서 빠진다 — 다시 올리면 같은 400 이 영원히 온다", () => {
    const result = partitionPointStream([pointAt(1), tombstoneAt(2), pointAt(3)]);

    expect(result.points.map((p) => p.rawSeq)).toEqual([1, 3]);
    expect(result.terminalRawSeqs).toEqual([2]);
  });

  /*
    #164 의 핵심이다. tombstone 을 빼고 max 를 세면 죽은 번호를 다른 점에 다시 부여하게 되고,
    같은 generation 의 rawSeq 를 다른 payload 로 재사용하지 않는다는 규칙이 깨진다.
  */
  it("tombstone 이 가장 큰 번호면 그것이 max 다", () => {
    expect(partitionPointStream([pointAt(1), tombstoneAt(9)]).maxRawSeq).toBe(9);
  });

  it("측정점이 가장 큰 번호면 그것이 max 다", () => {
    expect(partitionPointStream([tombstoneAt(2), pointAt(8)]).maxRawSeq).toBe(8);
  });

  /*
    이 판별자가 생기기 전에 저장된 버퍼가 기기에 남아 있을 수 있다. 그것을 tombstone 으로
    오인하면 진행 중이던 러닝의 점을 하나도 올리지 못한다.
  */
  it("kind 가 없는 예전 레코드는 측정점으로 읽는다", () => {
    const legacy = { ...pointAt(5) } as BufferedPoint & { kind?: unknown };
    delete legacy.kind;

    const result = partitionPointStream([legacy]);

    expect(result.points).toHaveLength(1);
    expect(result.terminalRawSeqs).toEqual([]);
    expect(result.maxRawSeq).toBe(5);
  });

  it("순서가 뒤섞여 들어와도 오름차순으로 돌려준다", () => {
    const result = partitionPointStream([
      pointAt(4),
      tombstoneAt(5),
      pointAt(1),
      tombstoneAt(2),
    ]);

    expect(result.points.map((p) => p.rawSeq)).toEqual([1, 4]);
    expect(result.terminalRawSeqs).toEqual([2, 5]);
    expect(result.maxRawSeq).toBe(5);
  });
});

/**
 * 위 둘이 함께 도는 경로 — reload 뒤 tombstone 으로 복원한 번호가 종료 번호를 제대로 낮추는가.
 * 이것이 #164 가 막으려는 실패의 마지막 고리다.
 */
describe("tombstone 복원 → 종료 번호", () => {
  it("빈 자리 앞까지로 낮춘다", () => {
    const { terminalRawSeqs, maxRawSeq } = partitionPointStream([
      tombstoneAt(5),
      pointAt(6),
      pointAt(7),
    ]);

    // 다시 열었을 때 이어 붙일 번호 = max(서버 max, 아는 max) + 1
    const nextRawSeq = Math.max(7, maxRawSeq) + 1;

    expect(finishLastRawSeq(nextRawSeq, terminalRawSeqs)).toBe(4);
  });
});

function pointAt(rawSeq: number): BufferedPoint {
  return {
    userId: "u1",
    sessionId: "s1",
    trackerGeneration: 1,
    rawSeq,
    segment: 0,
    lat: 37.4,
    lng: 127.1,
    recordedAt: 1_700_000_000_000 + rawSeq,
    accuracy: 10,
  };
}

function tombstoneAt(rawSeq: number): TerminalTombstone {
  return {
    kind: "terminal",
    userId: "u1",
    sessionId: "s1",
    trackerGeneration: 1,
    rawSeq,
    reason: "invalid_recorded_at_past",
  };
}
