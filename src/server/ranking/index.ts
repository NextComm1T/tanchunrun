import "server-only";

import { eq, sql } from "drizzle-orm";

import { getDb, type Db } from "@/server/db/client";
import { runSessions } from "@/server/db/schema";

/**
 * 랭킹 집계 — 물리 테이블 없이 `run_sessions` 에서 파생한다(#85 · D6 = B).
 *
 * `personal_bests` · `ranking_aggregates` 같은 별도 테이블은 만들지 않는다. **공개 canonical
 * source 는 `run_sessions WHERE save_state = 'saved'` 하나뿐**이고, 이 모듈이 그 위에서
 * 누적 거리 · 순위를 계산한다. `finish.ts`(tx2 순위 스냅샷)와 #87(랭킹 · 홈 요약)이 함께
 * 재사용한다.
 */

/** `select` 만 필요하다. `finish.ts` 의 tx2 transaction 안에서도 그대로 쓸 수 있다. */
type Queryable = Pick<Db, "select">;

export type Rankable = {
  userId: string;
  cumulativeDistanceM: number;
  firstReachedAt: Date;
};

export type RankedUser = Rankable & { rank: number };

type UserAggregate = { cumulativeDistanceM: number; firstReachedAt: Date | null };

/**
 * `saved` 세션에서 사용자별 누적 거리 · firstReachedAt 을 뽑는다.
 *
 * **`firstReachedAt` 은 이름과 달리 가장 오래된 시각이 아니라, 양(+) 기여 세션 중 가장
 * 최근의 `finished_at`(= `max(finished_at) filter (tancheon_distance_m > 0)`)이다**(D6).
 * 누적 거리는 양 기여가 저장될 때만 늘어나므로, 지금 값에 **처음** 도달한 시각은 논리적으로
 * 마지막 양 기여 세션의 종료 시각과 같다 — 그 뒤로 값이 그대로이기 때문이다. 인정 거리 0인
 * 세션이 나중에 저장돼도 이 값은 바뀌지 않는다(0km 기여 invariant).
 */
async function getSavedAggregatesByUser(
  db: Queryable,
): Promise<Map<string, UserAggregate>> {
  const rows = await db
    .select({
      userId: runSessions.userId,
      cumulativeDistanceM: sql<string>`coalesce(sum(${runSessions.tancheonDistanceM}), 0)`,
      firstReachedAt: sql<Date | null>`max(${runSessions.finishedAt}) filter (where ${runSessions.tancheonDistanceM} > 0)`,
    })
    .from(runSessions)
    .where(eq(runSessions.saveState, "saved"))
    .groupBy(runSessions.userId);

  return new Map(
    rows.map((row) => [
      row.userId,
      {
        cumulativeDistanceM: Number(row.cumulativeDistanceM),
        firstReachedAt: row.firstReachedAt,
      },
    ]),
  );
}

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

/** 지금 이 순간의 전체 랭킹(#87 이 재사용). 인정 거리가 0보다 큰 사용자만 올린다(P5). */
export async function getLiveRanking(db: Queryable = getDb()): Promise<RankedUser[]> {
  const aggregates = await getSavedAggregatesByUser(db);

  const rankable: Rankable[] = [...aggregates.entries()]
    .filter(([, agg]) => agg.cumulativeDistanceM > 0 && agg.firstReachedAt !== null)
    .map(([userId, agg]) => ({
      userId,
      cumulativeDistanceM: agg.cumulativeDistanceM,
      firstReachedAt: agg.firstReachedAt as Date,
    }));

  return competitionRank(rankable);
}

export type RankSnapshot =
  | { kind: "ranked"; rank: number }
  | { kind: "unranked" }
  | { kind: "no_data" };

/**
 * tx2 시점의 순위 스냅샷(#85 · D7). **이 세션을 저장하기 전에** 부른다 — `run_sessions` 를
 * 아직 고치지 않았으므로 다른 `saved` 세션만 집계에 잡히고, 이 세션의 기여는 인자로 직접
 * 더한다. 계산 결과는 `rank_snapshot` · `rank_snapshot_kind` 로 저장되어 **immutable** 해진다
 * — 그 뒤 live ranking 이 바뀌어도 소급 수정하지 않는다.
 *
 * `kind` 판정은 오직 이 사용자의 누적값만 본다(전체 시스템에 다른 순위 데이터가 있는지는
 * 보지 않는다) — 그래서 "랭킹 데이터가 없는 첫 러너" 는 정확히 "이번 세션을 포함해도 누적
 * 인정 거리가 0인 사용자"를 뜻한다.
 *
 * - 누적(기존 + 이번 세션) 이 0 이면 `no_data`("아직 랭킹 데이터가 없습니다").
 * - 누적은 0보다 크지만 **이번 세션 자체**가 0 이면 `unranked`("랭킹 미반영") — 사용자는
 *   이미 순위가 있지만 이번 러닝은 반영되지 않았다는 뜻이다.
 * - 그 외에는 `ranked` + 그 순간의 순위.
 */
export async function computeRankSnapshot(
  db: Queryable,
  input: {
    userId: string;
    candidateTancheonDistanceM: number;
    candidateFinishedAt: Date;
  },
): Promise<RankSnapshot> {
  const aggregates = await getSavedAggregatesByUser(db);
  const existing = aggregates.get(input.userId) ?? {
    cumulativeDistanceM: 0,
    firstReachedAt: null,
  };

  const cumulativeDistanceM =
    existing.cumulativeDistanceM + input.candidateTancheonDistanceM;
  const firstReachedAt =
    input.candidateTancheonDistanceM > 0
      ? input.candidateFinishedAt
      : existing.firstReachedAt;

  if (cumulativeDistanceM <= 0 || firstReachedAt === null) {
    return { kind: "no_data" };
  }
  if (input.candidateTancheonDistanceM <= 0) {
    return { kind: "unranked" };
  }

  const others: Rankable[] = [...aggregates.entries()]
    .filter(
      ([userId, agg]) =>
        userId !== input.userId && agg.cumulativeDistanceM > 0 && agg.firstReachedAt !== null,
    )
    .map(([userId, agg]) => ({
      userId,
      cumulativeDistanceM: agg.cumulativeDistanceM,
      firstReachedAt: agg.firstReachedAt as Date,
    }));

  const ranked = competitionRank([
    ...others,
    { userId: input.userId, cumulativeDistanceM, firstReachedAt },
  ]);

  const mine = ranked.find((user) => user.userId === input.userId);
  return mine ? { kind: "ranked", rank: mine.rank } : { kind: "no_data" };
}
