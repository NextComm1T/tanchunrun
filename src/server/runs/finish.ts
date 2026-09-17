import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { measure, ZONE_VERSION, type RawPoint } from "@/domain/measure";
import { getDb } from "@/server/db/client";
import { routePoints, runSessions, users } from "@/server/db/schema";
import { computePbFlags, getPbBaseline } from "@/server/personalBest";
import { computeRankSnapshot } from "@/server/ranking";

import { ackThroughRawSeq } from "./ack";
import {
  getOrderedRoutePoints,
  type StoredRoutePoint,
} from "./getOrderedRoutePoints";
import {
  FINISH_BUCKET_CAPACITY,
  FINISH_BUCKET_COST,
  FINISH_BUCKET_REFILL_PER_SECOND,
  FUTURE_CLOCK_TOLERANCE_MS,
} from "./policy";
import { consumeSessionTokens } from "./rateLimit";
import { hashTrackerToken } from "./tracker";

/**
 * 러닝 종료 2단계 처리 + 결과 조회(#85 · D6 · D7 · D13 · D14 · P14).
 *
 * ## 두 단계
 *
 * **tx1**(`finishRun` 앞부분) — `active → finished` 로 전이하고 `finished_at`(D13) ·
 * `save_state = 'pending'` 을 커밋한다. **tx2**(`finalizeSession`) — 저장된 raw 점을
 * `src/domain/measure`(#82)로 다시 계산해 결과 컬럼 · PB · 순위 스냅샷을 확정하고
 * `save_state = 'saved'` 로 옮긴다. **client 가 보낸 거리값은 어디서도 쓰지 않는다.**
 *
 * tx2 가 실패하면(예외) tx3 로 `save_state = 'failed'` 만 남긴다 — tx1 은 이미 커밋됐으므로
 * 세션은 `finished` 로 남고, `retryFinalization` 이 다시 tx2 를 시도한다.
 *
 * ## 멱등
 *
 * `status = 'finished'` 인 세션에 다시 `finishRun` 을 불러도(더블 제출) 새로 끝내지 않고
 * 지금의 `save_state` 를 이어간다 — `saved` 면 그대로, `pending`/`failed` 면 tx2 를 다시
 * 시도한다(`retryFinalization` 과 같은 경로).
 */

export type FinishRunInput = {
  sessionId: string;
  /** 인증된 viewer 의 id. client 가 보낸 값이 아니다. */
  userId: string;
  trackerToken: string;
  trackerGeneration: number;
  /** epoch ms. 기기가 종료를 누른 시각 — D13 이 clamp 한다. */
  clientFinishedAt: number;
  /** 이 generation 에서 마지막으로 부여한 rawSeq. 점이 없으면 0(D11). */
  lastRawSeq: number;
};

export type FinishRunOutcome =
  | { ok: true; state: "saved" }
  | { ok: true; state: "finalization_failed" }
  | { ok: false; error: "points_missing"; expectedNextRawSeq: number }
  /** 내 세션이 아니거나 tracker token 이 맞지 않다. 셋을 구분해 알려 주지 않는다(#83 과 같다). */
  | { ok: false; error: "not_tracker" }
  | { ok: false; error: "tracker_superseded" }
  | { ok: false; error: "rate_limited"; retryAfterSec: number }
  | { ok: false; error: "failed" };

export type RetryFinalizationOutcome =
  | { ok: true; state: "saved" }
  | { ok: true; state: "finalization_failed" }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "rate_limited"; retryAfterSec: number }
  | { ok: false; error: "failed" };

type SessionForFinalize = {
  id: string;
  userId: string;
  startedAt: Date;
  finishedAt: Date;
};

/**
 * tx2 — 저장된 raw 점(모든 generation, D14 final target)으로 결과를 확정한다.
 *
 * 실패하면 여기서 삼키지 않고 예외를 그대로 두어 **transaction 전체를 롤백**시킨다 — 경계점
 * 일부만 들어가거나 집계가 반쪽으로 반영되는 상태를 만들지 않는다. 호출부(`finishRun` ·
 * `retryFinalization`)가 그 예외를 잡고 tx3 로 넘긴다.
 */
async function finalizeSession(
  session: SessionForFinalize,
): Promise<
  | { ok: true; state: "saved" }
  | { ok: true; state: "finalization_failed" }
  | { ok: false; error: "failed" }
> {
  try {
    await getDb().transaction(async (tx) => {
      const rows = await tx
        .select({
          trackerGeneration: routePoints.trackerGeneration,
          rawSeq: routePoints.rawSeq,
          segment: routePoints.segment,
          lat: routePoints.lat,
          lng: routePoints.lng,
          recordedAt: routePoints.recordedAt,
          accuracyM: routePoints.accuracyM,
        })
        .from(routePoints)
        .where(
          and(eq(routePoints.sessionId, session.id), eq(routePoints.kind, "measured")),
        );

      const raw: RawPoint[] = rows.map((row) => ({
        trackerGeneration: row.trackerGeneration,
        rawSeq: row.rawSeq,
        segment: row.segment,
        lat: row.lat,
        lng: row.lng,
        recordedAt: row.recordedAt.getTime(),
        accuracy: row.accuracyM ?? undefined,
      }));

      // D13 — duration 은 authoritative finished_at 기준이다. measure() 의 평균 페이스도
      // 같은 분모를 써야 결과 화면과 어긋나지 않는다.
      const durationSec = Math.max(
        0,
        Math.round(
          (session.finishedAt.getTime() - session.startedAt.getTime()) / 1000,
        ),
      );

      const result = measure(raw, { elapsedMs: durationSec * 1000 });

      const boundaries = result.routePoints.filter(
        (point) => point.kind === "boundary",
      );
      if (boundaries.length > 0) {
        await tx
          .insert(routePoints)
          .values(
            boundaries.map((point) => ({
              sessionId: session.id,
              trackerGeneration: point.trackerGeneration,
              rawSeq: point.rawSeq,
              ordinal: point.ordinal,
              kind: "boundary" as const,
              segment: point.segment,
              lat: point.lat,
              lng: point.lng,
              recordedAt: new Date(point.recordedAt),
              inZone: point.inZone,
            })),
          )
          // 재시도가 겹쳐도 이미 넣은 경계점을 다시 넣지 않는다.
          .onConflictDoNothing();
      }

      /*
        측정 지점의 `in_zone` · `excluded_from_prev_reason` 을 확정한다. 점마다 한 번씩
        UPDATE 한다 — 한 러닝의 점은 많아야 수천 개라 아직 문제가 되지 않는다(느려지면
        `VALUES` 기반 batch UPDATE 로 바꾼다 · `useRunTracker.ts` 의 같은 트레이드오프).
      */
      for (const point of result.routePoints) {
        if (point.kind !== "measured") continue;

        await tx
          .update(routePoints)
          .set({
            inZone: point.inZone,
            excludedFromPrevReason: point.excludedFromPrevReason,
          })
          .where(
            and(
              eq(routePoints.sessionId, session.id),
              eq(routePoints.trackerGeneration, point.trackerGeneration),
              eq(routePoints.rawSeq, point.rawSeq),
              eq(routePoints.ordinal, 0),
            ),
          );
      }

      const totalDistanceM = Math.round(result.totalDistanceM);
      const tancheonDistanceM = Math.round(result.tancheonDistanceM);
      const avgPaceSecPerKm =
        result.averagePaceSecPerKm !== null
          ? Math.round(result.averagePaceSecPerKm)
          : null;

      // baseline · 순위는 **이 세션을 저장하기 전에** 계산한다 — run_sessions 의 이 행이
      // 아직 save_state = 'saved' 가 아니므로 다른 saved 세션만 집계에 잡힌다(D6).
      const baseline = await getPbBaseline(tx, session.userId, session.id);
      const pbFlags = computePbFlags(baseline, {
        totalDistanceM,
        avgPaceSecPerKm,
        durationSec,
      });

      const snapshot = await computeRankSnapshot(tx, {
        userId: session.userId,
        candidateTancheonDistanceM: tancheonDistanceM,
        candidateFinishedAt: session.finishedAt,
      });

      await tx
        .update(runSessions)
        .set({
          zoneVersion: ZONE_VERSION,
          totalDistanceM,
          tancheonDistanceM,
          durationSec,
          avgPaceSecPerKm,
          rankSnapshot: snapshot.kind === "ranked" ? snapshot.rank : null,
          rankSnapshotKind: snapshot.kind,
          pbFlags: pbFlags.length > 0 ? pbFlags : null,
          saveState: "saved",
          savedAt: new Date(),
        })
        .where(eq(runSessions.id, session.id));
    });

    return { ok: true, state: "saved" };
  } catch {
    // 좌표 값을 로그에 남기지 않는다. tx2 는 통째로 롤백됐다 — tx3 로 failed 를 남긴다.
    const marked = await markFinalizationFailed(session.id);
    if (marked === "saved") return { ok: true, state: "saved" };
    if (marked === "failed") return { ok: true, state: "finalization_failed" };
    return { ok: false, error: "failed" };
  }
}

/**
 * tx3 — tx2 롤백 뒤 `save_state = 'failed'` 로 남긴다.
 *
 * **`save_state = 'pending'` 일 때만** 고친다 — 동시에 들어온 다른 시도가 먼저 `saved` 로
 * 확정했다면 그 결과를 덮어쓰지 않는다. tx3 자체가 실패하면 `pending` 그대로 남아 재시도
 * 대상이다(spec 그대로).
 */
async function markFinalizationFailed(
  sessionId: string,
): Promise<"failed" | "saved" | "unknown"> {
  try {
    const updated = await getDb()
      .update(runSessions)
      .set({ saveState: "failed" })
      .where(
        and(
          eq(runSessions.id, sessionId),
          eq(runSessions.status, "finished"),
          eq(runSessions.saveState, "pending"),
        ),
      )
      .returning({ id: runSessions.id });

    if (updated.length > 0) return "failed";

    const rows = await getDb()
      .select({ saveState: runSessions.saveState })
      .from(runSessions)
      .where(eq(runSessions.id, sessionId))
      .limit(1);

    return rows[0]?.saveState === "saved" ? "saved" : "unknown";
  } catch {
    return "unknown";
  }
}

/** 이미 `finished` 인 세션에 다시 온 요청(더블 제출 · 재시도)의 멱등 경로. */
async function resumeFinished(session: {
  id: string;
  userId: string;
  startedAt: Date;
  finishedAt: Date | null;
  saveState: string | null;
}): Promise<FinishRunOutcome> {
  if (session.saveState === "saved") return { ok: true, state: "saved" };
  if (session.finishedAt === null) return { ok: false, error: "failed" };

  return finalizeSession({
    id: session.id,
    userId: session.userId,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
  });
}

export async function finishRun(input: FinishRunInput): Promise<FinishRunOutcome> {
  try {
    const rows = await getDb()
      .select({
        status: runSessions.status,
        saveState: runSessions.saveState,
        startedAt: runSessions.startedAt,
        finishedAt: runSessions.finishedAt,
        trackerGeneration: runSessions.trackerGeneration,
        trackerTokenHash: runSessions.trackerTokenHash,
      })
      .from(runSessions)
      .where(
        and(eq(runSessions.id, input.sessionId), eq(runSessions.userId, input.userId)),
      )
      .limit(1);

    const session = rows[0];
    if (!session) return { ok: false, error: "not_tracker" };

    // 더블 제출 · 재시도 멱등(P14) — 이미 끝난 세션은 새로 끝내지 않는다.
    if (session.status === "finished") {
      return resumeFinished({ id: input.sessionId, userId: input.userId, ...session });
    }

    // ②. generation · token — appendPoints(#83)와 같은 판정이다.
    if (input.trackerGeneration < session.trackerGeneration) {
      return { ok: false, error: "tracker_superseded" };
    }
    if (input.trackerGeneration !== session.trackerGeneration) {
      return { ok: false, error: "not_tracker" };
    }
    if (hashTrackerToken(input.trackerToken) !== session.trackerTokenHash) {
      return { ok: false, error: "not_tracker" };
    }

    const finishReceivedAt = new Date();

    const attempt = await getDb().transaction(async (tx) => {
      // ③. admission 은 tx1 과 같은 transaction 에서 일어난다(D11) — commit 되면 token
      // 소비도 함께 commit 되고, tx2 가 나중에 실패해도 환불하지 않는다.
      const admission = await consumeSessionTokens(
        {
          kind: "finish",
          sessionId: input.sessionId,
          cost: FINISH_BUCKET_COST,
          capacity: FINISH_BUCKET_CAPACITY,
          refillPerSecond: FINISH_BUCKET_REFILL_PER_SECOND,
        },
        tx,
      );
      if (!admission.allowed) {
        return { kind: "rate_limited" as const, retryAfterSec: admission.retryAfterSec };
      }

      // 완전성 확인(상태 변경 전) — 현재 generation 이 1..lastRawSeq 까지 이어져 있는가.
      // lastRawSeq = 0(accept fix 0개)은 `ackThroughRawSeq([]) === 0` 이라 그대로 통과한다.
      const stored = await tx
        .select({ rawSeq: routePoints.rawSeq })
        .from(routePoints)
        .where(
          and(
            eq(routePoints.sessionId, input.sessionId),
            eq(routePoints.trackerGeneration, input.trackerGeneration),
            eq(routePoints.ordinal, 0),
          ),
        )
        .orderBy(asc(routePoints.rawSeq));

      const contiguousThrough = ackThroughRawSeq(stored.map((row) => row.rawSeq));
      if (contiguousThrough !== input.lastRawSeq) {
        // 토큰은 이미 썼지만(D11) 세션 상태는 바꾸지 않는다 — 이 transaction 은 그대로
        // commit 된다.
        return {
          kind: "points_missing" as const,
          expectedNextRawSeq: contiguousThrough + 1,
        };
      }

      // D13 — finished_at = clamp(clientFinishedAt, lowerBound, upperBound).
      // lowerBound 는 D14 final target(모든 generation)의 최댓값이다.
      const latestPoint = await tx
        .select({ recordedAt: routePoints.recordedAt })
        .from(routePoints)
        .where(
          and(eq(routePoints.sessionId, input.sessionId), eq(routePoints.kind, "measured")),
        )
        .orderBy(desc(routePoints.recordedAt))
        .limit(1);

      const lowerBoundMs = Math.max(
        session.startedAt.getTime(),
        latestPoint[0]?.recordedAt.getTime() ?? session.startedAt.getTime(),
      );
      const upperBoundMs = finishReceivedAt.getTime() + FUTURE_CLOCK_TOLERANCE_MS;
      const finishedAtMs = Math.min(
        Math.max(input.clientFinishedAt, lowerBoundMs),
        upperBoundMs,
      );
      const finishedAt = new Date(finishedAtMs);

      const updated = await tx
        .update(runSessions)
        .set({ status: "finished", finishedAt, finishReceivedAt, saveState: "pending" })
        .where(
          and(
            eq(runSessions.id, input.sessionId),
            eq(runSessions.userId, input.userId),
            eq(runSessions.status, "active"),
            eq(runSessions.trackerGeneration, input.trackerGeneration),
          ),
        )
        .returning({ id: runSessions.id });

      if (updated.length === 0) {
        // 그 사이 다른 요청이 먼저 끝냈다(더블 제출) — 실패가 아니라 멱등 경로다.
        return { kind: "lost_race" as const };
      }

      return { kind: "tx1_committed" as const, finishedAt };
    });

    switch (attempt.kind) {
      case "rate_limited":
        return { ok: false, error: "rate_limited", retryAfterSec: attempt.retryAfterSec };
      case "points_missing":
        return {
          ok: false,
          error: "points_missing",
          expectedNextRawSeq: attempt.expectedNextRawSeq,
        };
      case "lost_race": {
        const resumed = await getDb()
          .select({
            status: runSessions.status,
            saveState: runSessions.saveState,
            startedAt: runSessions.startedAt,
            finishedAt: runSessions.finishedAt,
          })
          .from(runSessions)
          .where(
            and(eq(runSessions.id, input.sessionId), eq(runSessions.userId, input.userId)),
          )
          .limit(1);

        const row = resumed[0];
        if (!row || row.status !== "finished") return { ok: false, error: "failed" };
        return resumeFinished({ id: input.sessionId, userId: input.userId, ...row });
      }
      case "tx1_committed":
        return finalizeSession({
          id: input.sessionId,
          userId: input.userId,
          startedAt: session.startedAt,
          finishedAt: attempt.finishedAt,
        });
    }
  } catch {
    // 인터넷 · 서버 · DB 도달 불가(실패 A) — 서버 상태는 바뀌지 않았다.
    return { ok: false, error: "failed" };
  }
}

/**
 * 연결 복구 시(client 자동) 또는 결과 화면의 "다시 시도"로 부른다.
 *
 * `finished` + (`pending` | `failed`) 만 대상이다 — `active` 나 이미 `saved` 인 세션,
 * 남의 세션은 재시도 대상이 아니다(같은 오류로 묶어 알려 주지 않는다).
 */
export async function retryFinalization(
  sessionId: string,
  userId: string,
): Promise<RetryFinalizationOutcome> {
  try {
    const rows = await getDb()
      .select({
        status: runSessions.status,
        saveState: runSessions.saveState,
        startedAt: runSessions.startedAt,
        finishedAt: runSessions.finishedAt,
      })
      .from(runSessions)
      .where(and(eq(runSessions.id, sessionId), eq(runSessions.userId, userId)))
      .limit(1);

    const session = rows[0];
    if (
      !session ||
      session.status !== "finished" ||
      session.saveState === "saved" ||
      session.finishedAt === null
    ) {
      return { ok: false, error: "not_found" };
    }

    const admission = await consumeSessionTokens({
      kind: "finish",
      sessionId,
      cost: FINISH_BUCKET_COST,
      capacity: FINISH_BUCKET_CAPACITY,
      refillPerSecond: FINISH_BUCKET_REFILL_PER_SECOND,
    });
    if (!admission.allowed) {
      return { ok: false, error: "rate_limited", retryAfterSec: admission.retryAfterSec };
    }

    return finalizeSession({
      id: sessionId,
      userId,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
    });
  } catch {
    return { ok: false, error: "failed" };
  }
}

export type ResultData = {
  /** `YYYY-MM-DD`(Asia/Seoul). 화면이 표기 형식을 정한다. */
  runDate: string;
  totalDistanceM: number;
  tancheonDistanceM: number;
  durationSec: number;
  avgPaceSecPerKm: number | null;
  rankSnapshot: number | null;
  rankSnapshotKind: "ranked" | "unranked" | "no_data";
  pbFlags: string[];
  nickname: string | null;
  points: StoredRoutePoint[];
};

export type GetResultOutcome =
  | { state: "saved"; data: ResultData }
  | { state: "finalization_pending" | "finalization_failed" }
  | { state: "active" }
  | { state: "not_found" };

/**
 * 결과 화면의 단일 조회(#85). **타인 · 없는 id 를 구분하지 않는다** — 둘 다 `not_found` 다.
 *
 * **`active` 를 여기서 `/running` 으로 보내지 않는다.** 이 기기가 종료 intent 를 갖고 있는지
 * (recovery 대상인지) 는 client 의 IndexedDB 에만 있어서, 그 판단은 `ResultRecoveryGate` 가
 * 한다.
 */
export async function getResult(
  sessionId: string,
  userId: string,
): Promise<GetResultOutcome> {
  const rows = await getDb()
    .select({
      status: runSessions.status,
      saveState: runSessions.saveState,
      runDate: runSessions.runDate,
      totalDistanceM: runSessions.totalDistanceM,
      tancheonDistanceM: runSessions.tancheonDistanceM,
      durationSec: runSessions.durationSec,
      avgPaceSecPerKm: runSessions.avgPaceSecPerKm,
      rankSnapshot: runSessions.rankSnapshot,
      rankSnapshotKind: runSessions.rankSnapshotKind,
      pbFlags: runSessions.pbFlags,
      nickname: users.nickname,
    })
    .from(runSessions)
    .innerJoin(users, eq(users.id, runSessions.userId))
    .where(and(eq(runSessions.id, sessionId), eq(runSessions.userId, userId)))
    .limit(1);

  const session = rows[0];
  if (!session) return { state: "not_found" };
  if (session.status === "active") return { state: "active" };
  if (session.saveState === "pending") return { state: "finalization_pending" };
  if (session.saveState === "failed") return { state: "finalization_failed" };

  if (
    session.saveState !== "saved" ||
    session.totalDistanceM === null ||
    session.tancheonDistanceM === null ||
    session.durationSec === null ||
    session.rankSnapshotKind === null
  ) {
    // finished + saved 인데 결과 컬럼이 비어 있으면 정상 상태로 보여 주지 않는다.
    return { state: "finalization_failed" };
  }

  const { points } = await getOrderedRoutePoints(sessionId);

  return {
    state: "saved",
    data: {
      runDate: session.runDate,
      totalDistanceM: session.totalDistanceM,
      tancheonDistanceM: session.tancheonDistanceM,
      durationSec: session.durationSec,
      avgPaceSecPerKm: session.avgPaceSecPerKm,
      rankSnapshot: session.rankSnapshot,
      rankSnapshotKind: session.rankSnapshotKind as "ranked" | "unranked" | "no_data",
      pbFlags: session.pbFlags ?? [],
      nickname: session.nickname,
      points,
    },
  };
}
