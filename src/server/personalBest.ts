import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";

import type { Db } from "@/server/db/client";
import { runSessions } from "@/server/db/schema";

/**
 * 개인 최고 기록 — 물리 테이블 없이 `run_sessions` 에서 파생한다(#85 · D6 = B · `docs/06-data.md`).
 *
 * 세 항목뿐이다 — **최장 거리**(총 러닝 거리 기준, Zone 제한 없음) · **최고 페이스**(분/km,
 * 작을수록 빠르다) · **최대 운동 시간**. 각 기록을 세운 일자는 MVP 범위 밖이다(06 기각 항목).
 */

type Queryable = Pick<Db, "select">;

export type PbBaseline = {
  longestDistanceM: number | null;
  bestPaceSecPerKm: number | null;
  longestDurationSec: number | null;
};

/** 결과 화면 · 기록 탭이 그대로 보여 줄 배지 문구(F9 예시 · F6). */
export const PB_LABELS = {
  distance: "최장 거리 갱신",
  pace: "최고 페이스 갱신",
  duration: "최대 운동 시간 갱신",
} as const;

/**
 * 기존 개인 최고 기록(baseline). **이번 세션은 반드시 `excludeSessionId` 로 뺀다**(D6 —
 * "기존 PB baseline 에는 current session 제외") · 그래야 이번 러닝이 자기 자신과 비교되지
 * 않는다. `save_state = 'saved'` 인 세션만 본다 — 저장에 실패한 세션은 기록으로 치지 않는다.
 */
export async function getPbBaseline(
  db: Queryable,
  userId: string,
  excludeSessionId: string,
): Promise<PbBaseline> {
  const rows = await db
    .select({
      longestDistanceM: sql<number | null>`max(${runSessions.totalDistanceM})`,
      bestPaceSecPerKm: sql<number | null>`min(${runSessions.avgPaceSecPerKm}) filter (where ${runSessions.totalDistanceM} > 0)`,
      longestDurationSec: sql<number | null>`max(${runSessions.durationSec})`,
    })
    .from(runSessions)
    .where(
      and(
        eq(runSessions.userId, userId),
        eq(runSessions.saveState, "saved"),
        ne(runSessions.id, excludeSessionId),
      ),
    );

  const row = rows[0];

  return {
    longestDistanceM: row?.longestDistanceM ?? null,
    bestPaceSecPerKm: row?.bestPaceSecPerKm ?? null,
    longestDurationSec: row?.longestDurationSec ?? null,
  };
}

export type PbCandidate = {
  totalDistanceM: number;
  avgPaceSecPerKm: number | null;
  durationSec: number;
};

/**
 * 갱신된 항목의 이름 목록(F6 · F9). 빈 배열이면 이번 러닝은 개인 최고 기록이 아니다.
 *
 * baseline 이 없으면(첫 러닝) 무조건 갱신이다(F7 예외) — 최고 페이스만 **이번 세션의 총
 * 러닝 거리가 0보다 커야** 평가한다(거리 0 이면 페이스를 낼 수 없다 · F6). 최장 거리 ·
 * 최대 운동 시간은 총 러닝 거리가 0인 세션도 그대로 판정한다.
 */
export function computePbFlags(
  baseline: PbBaseline,
  candidate: PbCandidate,
): string[] {
  const flags: string[] = [];

  if (
    baseline.longestDistanceM === null ||
    candidate.totalDistanceM > baseline.longestDistanceM
  ) {
    flags.push(PB_LABELS.distance);
  }

  if (
    candidate.totalDistanceM > 0 &&
    candidate.avgPaceSecPerKm !== null &&
    (baseline.bestPaceSecPerKm === null ||
      candidate.avgPaceSecPerKm < baseline.bestPaceSecPerKm)
  ) {
    flags.push(PB_LABELS.pace);
  }

  if (
    baseline.longestDurationSec === null ||
    candidate.durationSec > baseline.longestDurationSec
  ) {
    flags.push(PB_LABELS.duration);
  }

  return flags;
}
