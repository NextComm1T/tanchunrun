import { describe, expect, it } from "vitest";

import { competitionRank, type Rankable } from "./rank";

/** 값 자체는 뜻이 없다. **누적 거리와 도달 시각이 같은지 · 다른지**가 순위를 정한다. */
function user(userId: string, cumulativeDistanceM: number, firstReachedAt: string): Rankable {
  return { userId, cumulativeDistanceM, firstReachedAt: new Date(firstReachedAt) };
}

const ranks = (users: readonly Rankable[]) =>
  competitionRank(users).map(({ userId, rank }) => [userId, rank]);

describe("competitionRank — D7", () => {
  it("누적 거리 내림차순으로 1, 2, 3 을 준다", () => {
    expect(
      ranks([
        user("a", 1000, "2026-09-17T10:00:00Z"),
        user("b", 3000, "2026-09-17T10:00:00Z"),
        user("c", 2000, "2026-09-17T10:00:00Z"),
      ]),
    ).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
  });

  // #144 — 이 경로가 도는 입력이 테스트에 없어서 문자열 firstReachedAt 이 드러나지 않았다
  it("누적 거리가 같으면 firstReachedAt 이 이른 쪽이 위이고 순위도 다르다(P5)", () => {
    expect(
      ranks([
        user("late", 2000, "2026-09-17T11:00:00Z"),
        user("early", 2000, "2026-09-17T09:00:00Z"),
      ]),
    ).toEqual([
      ["early", 1],
      ["late", 2],
    ]);
  });

  it("누적 거리 · firstReachedAt 이 모두 같을 때만 공동 순위다 — 1, 2, 2, 4", () => {
    expect(
      ranks([
        user("d", 1000, "2026-09-17T09:00:00Z"),
        user("b", 2000, "2026-09-17T09:00:00Z"),
        user("a", 3000, "2026-09-17T09:00:00Z"),
        user("c", 2000, "2026-09-17T09:00:00Z"),
      ]).map(([, rank]) => rank),
    ).toEqual([1, 2, 2, 4]);
  });

  it("공동 순위 뒤 동점이지만 더 늦게 도달한 사용자는 건너뛴 번호를 받는다", () => {
    expect(
      ranks([
        user("x", 2000, "2026-09-17T09:00:00Z"),
        user("y", 2000, "2026-09-17T09:00:00Z"),
        user("z", 2000, "2026-09-17T10:00:00Z"),
      ]).map(([, rank]) => rank),
    ).toEqual([1, 1, 3]);
  });

  it("빈 목록은 빈 목록이다", () => {
    expect(competitionRank([])).toEqual([]);
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const input = [user("a", 1000, "2026-09-17T10:00:00Z"), user("b", 2000, "2026-09-17T10:00:00Z")];
    const before = input.map((u) => u.userId);
    competitionRank(input);
    expect(input.map((u) => u.userId)).toEqual(before);
  });
});
