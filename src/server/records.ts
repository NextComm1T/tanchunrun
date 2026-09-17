import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { runSessions } from "@/server/db/schema";
import {
  getOrderedRoutePoints,
  type StoredRoutePoint,
} from "@/server/runs/getOrderedRoutePoints";

/**
 * 기록 탭(F7) · 기록 상세(F11)의 조회(#86 · D6 · P6 · R9 · R23).
 *
 * **모든 조회를 viewer 의 `userId` 로 거른다**(P6 · SP1). 경로 좌표는 본인만 볼 수 있고,
 * 타인 세션과 없는 id 를 구분하지 않는다 — 둘 다 같은 404 다. 구분하면 어떤 id 가 실재하는지
 * 알려 주는 셈이 된다.
 *
 * **source 는 `save_state = 'saved'` 하나뿐이다**(D6 = B). 저장에 실패했거나 진행 중인 세션은
 * 기록이 아니다(P14). `personal_bests` · `ranking_aggregates` 같은 물리 테이블은 없고
 * 개인 최고 기록 · 누적 거리를 여기서 파생한다 — 랭킹(`src/server/ranking`)과 **같은 source**
 * 를 보므로 기록 탭의 인정 누적 거리와 `/ranking` 의 본인 거리가 어긋날 수 없다.
 */

/** 목록 한 줄. 화면이 쓰는 값만 담는다 — 경로는 상세에서만 읽는다. */
export type RecordSummary = {
  id: string;
  /**
   * 러닝 일자 `YYYY-MM-DD`. 결과 화면(#85)이 쓰는 것과 **같은 `run_date` 컬럼**이다.
   *
   * `finished_at` 에서 날짜를 뽑지 않는다 — timestamptz 를 날짜로 바꾸려면 timezone 을 정해야
   * 하고, 서버 렌더 환경에 따라 하루가 밀릴 수 있다. 저장할 때 정해진 값을 그대로 쓴다.
   */
  runDate: string;
  totalDistanceM: number;
  tancheonDistanceM: number;
  durationSec: number;
  /** 초/km. 거리가 0 이면 낼 수 없어 `null` 이다. */
  avgPaceSecPerKm: number | null;
};

/** 누적 2종(R23). */
export type RecordTotals = {
  /** 전체 러닝 총 누적 거리(m). Zone 밖 거리도 포함한다(R12). */
  totalDistanceM: number;
  /** 탄천 Ranking Zone 인정 누적 거리(m). 랭킹 누적과 같은 source 다(D6). */
  tancheonDistanceM: number;
};

/** 개인 최고 기록(F7). 해당 기록이 없으면 `null` 이다. */
export type PersonalBest = {
  longestDistanceM: number | null;
  longestDurationSec: number | null;
  /** 초/km. 작을수록 빠르다. **거리 0 세션은 판정에서 제외한다**(D6). */
  bestPaceSecPerKm: number | null;
};

export type RecordDetail = RecordSummary & {
  points: StoredRoutePoint[];
};

/** 본인의 saved 세션만 고르는 조건. 모든 조회가 이것을 지나간다. */
function ownSaved(userId: string) {
  return and(
    eq(runSessions.userId, userId),
    eq(runSessions.saveState, "saved"),
  );
}

/**
 * 저장된 러닝 목록. **최신순 · 개수 제한 없음**(P6 · R9).
 *
 * `finished_at` 으로 정렬한다 — D13 이 정한 authoritative 시각이고, 결과 화면 · 랭킹이
 * 쓰는 것과 같은 값이라 화면마다 순서가 달라지지 않는다.
 */
export async function listRecords(userId: string): Promise<RecordSummary[]> {
  const rows = await getDb()
    .select({
      id: runSessions.id,
      runDate: runSessions.runDate,
      totalDistanceM: runSessions.totalDistanceM,
      tancheonDistanceM: runSessions.tancheonDistanceM,
      durationSec: runSessions.durationSec,
      avgPaceSecPerKm: runSessions.avgPaceSecPerKm,
    })
    .from(runSessions)
    .where(ownSaved(userId))
    .orderBy(desc(runSessions.finishedAt));

  return rows.map(toSummary);
}

/**
 * 누적 2종. 기록이 0건이면 둘 다 0 이다(F7 예외).
 *
 * 목록을 받아 합치지 않고 따로 집계한다 — 개수 제한이 없어 세션이 쌓이면 전부 실어 오는
 * 비용이 커지고, 합계는 DB 가 훨씬 싸게 낸다.
 */
export async function getRecordTotals(userId: string): Promise<RecordTotals> {
  const rows = await getDb()
    .select({
      totalDistanceM: sql<string>`coalesce(sum(${runSessions.totalDistanceM}), 0)`,
      tancheonDistanceM: sql<string>`coalesce(sum(${runSessions.tancheonDistanceM}), 0)`,
    })
    .from(runSessions)
    .where(ownSaved(userId));

  const row = rows[0];

  return {
    totalDistanceM: Number(row?.totalDistanceM ?? 0),
    tancheonDistanceM: Number(row?.tancheonDistanceM ?? 0),
  };
}

/**
 * 개인 최고 기록(D6 = B — saved 세션에서 파생).
 *
 * **최고 페이스만 `total_distance_m > 0` 을 건다.** 거리가 0 이면 페이스를 낼 수 없어
 * 판정에서 빠지고, 최장 거리 · 최대 운동 시간은 그 세션도 정상 평가한다
 * (`docs/06-data.md:40` · D6). 그래서 세 값을 한 번에 `max` 하지 않고 페이스만 filter 를 쓴다.
 *
 * #85 의 `getPbBaseline` 과 같은 source · 같은 규칙이라 결과 화면의 PR 배지와 여기 값이
 * 모순되지 않는다.
 */
export async function getPersonalBest(userId: string): Promise<PersonalBest> {
  const rows = await getDb()
    .select({
      longestDistanceM: sql<number | null>`max(${runSessions.totalDistanceM})`,
      longestDurationSec: sql<number | null>`max(${runSessions.durationSec})`,
      bestPaceSecPerKm: sql<number | null>`min(${runSessions.avgPaceSecPerKm}) filter (where ${runSessions.totalDistanceM} > 0)`,
    })
    .from(runSessions)
    .where(ownSaved(userId));

  const row = rows[0];

  return {
    longestDistanceM: row?.longestDistanceM ?? null,
    longestDurationSec: row?.longestDurationSec ?? null,
    bestPaceSecPerKm: row?.bestPaceSecPerKm ?? null,
  };
}

/**
 * 기록 상세 한 건. 본인 saved 세션이 아니면 `null` 이고, 화면이 404 로 보낸다.
 *
 * 경로는 **`getOrderedRoutePoints`**(#83)로 읽는다 — 결과 화면 · 러닝 복원과 같은 정렬
 * (`tracker_generation → raw_seq → ordinal`)이라 같은 세션이 화면마다 다른 순서로 그려지지
 * 않는다. 여기서 ORDER BY 를 새로 적지 않는다.
 */
export async function getRecord(
  sessionId: string,
  userId: string,
): Promise<RecordDetail | null> {
  const rows = await getDb()
    .select({
      id: runSessions.id,
      runDate: runSessions.runDate,
      totalDistanceM: runSessions.totalDistanceM,
      tancheonDistanceM: runSessions.tancheonDistanceM,
      durationSec: runSessions.durationSec,
      avgPaceSecPerKm: runSessions.avgPaceSecPerKm,
    })
    .from(runSessions)
    .where(and(eq(runSessions.id, sessionId), ownSaved(userId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const { points } = await getOrderedRoutePoints(sessionId);

  return { ...toSummary(row), points };
}

type SessionRow = {
  id: string;
  runDate: string;
  totalDistanceM: number | null;
  tancheonDistanceM: number | null;
  durationSec: number | null;
  avgPaceSecPerKm: number | null;
};

/**
 * `saved` 세션은 거리 · 시간이 채워져 있지만 컬럼은 nullable 이다(진행 중 세션과 같은 표를
 * 쓴다). 화면이 매번 `?? 0` 을 적지 않도록 여기서 한 번만 좁힌다.
 *
 * `avgPaceSecPerKm` 은 좁히지 않는다 — 거리 0 세션은 페이스가 **실제로 없는** 값이라
 * 0 으로 바꾸면 `--'--"` 로 보여야 할 자리가 `0'00"` 이 된다.
 */
function toSummary(row: SessionRow): RecordSummary {
  return {
    id: row.id,
    runDate: row.runDate,
    totalDistanceM: row.totalDistanceM ?? 0,
    tancheonDistanceM: row.tancheonDistanceM ?? 0,
    durationSec: row.durationSec ?? 0,
    avgPaceSecPerKm: row.avgPaceSecPerKm,
  };
}
