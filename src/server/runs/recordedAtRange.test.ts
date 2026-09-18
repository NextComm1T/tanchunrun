import { describe, expect, it } from "vitest";

import { classifyRecordedAt, firstOutOfRange } from "./recordedAtRange";

const EARLIEST = 1_000_000;
const LATEST = 2_000_000;

describe("classifyRecordedAt", () => {
  it("범위 안이면 null 이다", () => {
    expect(classifyRecordedAt(1_500_000, EARLIEST, LATEST)).toBeNull();
  });

  it("하한보다 이르면 past 다", () => {
    expect(classifyRecordedAt(EARLIEST - 1, EARLIEST, LATEST)).toBe("past");
  });

  it("상한보다 늦으면 future 다", () => {
    expect(classifyRecordedAt(LATEST + 1, EARLIEST, LATEST)).toBe("future");
  });

  /*
    경계값을 거절하면 client 의 prefilter 와 서버 판정이 1ms 차이로 갈린다 — client 가 번호를
    부여한 점을 서버가 거절하고, 그 번호가 빈 자리로 남는다(#164 가 고치는 바로 그 상황이다).
  */
  it("하한과 같으면 범위 안이다", () => {
    expect(classifyRecordedAt(EARLIEST, EARLIEST, LATEST)).toBeNull();
  });

  it("상한과 같으면 범위 안이다", () => {
    expect(classifyRecordedAt(LATEST, EARLIEST, LATEST)).toBeNull();
  });

  it("유한하지 않은 값은 past 로 거절한다 — 재시도해도 통과할 수 없다", () => {
    expect(classifyRecordedAt(Number.NaN, EARLIEST, LATEST)).toBe("past");
    expect(classifyRecordedAt(Number.POSITIVE_INFINITY, EARLIEST, LATEST)).toBe("past");
  });
});

describe("firstOutOfRange", () => {
  const point = (rawSeq: number, recordedAt: number) => ({ rawSeq, recordedAt });

  it("전부 범위 안이면 null 이다", () => {
    expect(
      firstOutOfRange(
        [point(1, 1_000_000), point(2, 1_500_000), point(3, 2_000_000)],
        EARLIEST,
        LATEST,
      ),
    ).toBeNull();
  });

  it("처음 걸린 점과 경계를 돌려준다", () => {
    expect(
      firstOutOfRange(
        [point(1, 1_500_000), point(2, 999_999), point(3, 2_000_001)],
        EARLIEST,
        LATEST,
      ),
    ).toEqual({ rawSeq: 2, bound: "past" });
  });

  it("past 가 없으면 future 를 집는다", () => {
    expect(
      firstOutOfRange([point(7, 1_500_000), point(8, 2_000_001)], EARLIEST, LATEST),
    ).toEqual({ rawSeq: 8, bound: "future" });
  });

  it("빈 배열은 null 이다", () => {
    expect(firstOutOfRange([], EARLIEST, LATEST)).toBeNull();
  });
});
