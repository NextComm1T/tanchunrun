/**
 * D7 순위 산정의 순수 규칙(#85 · #144).
 *
 * **`import "server-only"` 를 붙이지 않는다.** DB · cookie · `node:` 모듈을 쓰지 않는 순수 함수라
 * `npm test` 로 확인할 수 있어야 한다 — `ack.ts` 와 같은 이유다. 집계(DB 조회)는 `index.ts` 가 한다.
 */

export type Rankable = {
  userId: string;
  cumulativeDistanceM: number;
  firstReachedAt: Date;
};

export type RankedUser = Rankable & { rank: number };

/**
 * D7 정책 — `cumulativeDistance DESC → firstReachedAt ASC` 정렬 + competition ranking
 * (`1,2,2,4`). 둘 다 같을 때만 같은 순위를 준다 — 거리가 같아도 먼저 도달한 쪽이 위이므로
 * (P5), 실제로는 시각까지 완전히 같은 경우에만 tie 다.
 */
export function competitionRank(users: readonly Rankable[]): RankedUser[] {
  const sorted = [...users].sort((a, b) => {
    if (a.cumulativeDistanceM !== b.cumulativeDistanceM) {
      return b.cumulativeDistanceM - a.cumulativeDistanceM;
    }
    return a.firstReachedAt.getTime() - b.firstReachedAt.getTime();
  });

  const ranked: RankedUser[] = [];
  let previous: Rankable | null = null;
  let rank = 0;

  for (const [index, user] of sorted.entries()) {
    const tied =
      previous !== null &&
      previous.cumulativeDistanceM === user.cumulativeDistanceM &&
      previous.firstReachedAt.getTime() === user.firstReachedAt.getTime();

    if (!tied) rank = index + 1;
    ranked.push({ ...user, rank });
    previous = user;
  }

  return ranked;
}
