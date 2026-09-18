import { describe, expect, it } from "vitest";

import { finishLastRawSeq } from "./runBuffer";

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
