import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { routePoints, runSessions } from "@/server/db/schema";

import { ackThroughRawSeq, isSamePayload } from "./ack";
import {
  FUTURE_CLOCK_TOLERANCE_MS,
  POINTS_BUCKET_CAPACITY,
  POINTS_BUCKET_REFILL_PER_SECOND,
  pointsBucketCost,
} from "./policy";
import { consumeUserTokens } from "./rateLimit";
import { hashTrackerToken } from "./tracker";

/**
 * GPS 측정점 업로드(#83 · D11 · D14).
 *
 * ## 요청 처리 순서가 계약이다
 *
 * ① 인증 → ② 인가(소유 · active · tracker token · generation) → ③ rate limit → ④ 저장.
 *
 * **①② 에서 끊긴 요청은 rate-limit 행을 읽지도 소비하지도 않는다.** 그러지 않으면 남의
 * sessionId 를 아는 사람이 요청을 쏘아 그 사람의 bucket 을 고갈시킬 수 있다. 인증 · 인가는
 * 이 파일이 먼저 끝내고, 그 뒤에만 `consumeUserTokens` 를 부른다.
 *
 * ## 저장된 raw 점은 바뀌지 않는다
 *
 * 같은 키에 **같은 값**이 다시 오면 멱등하게 성공하고(재전송 · 중복 배치), 하나라도 다르면
 * 기존 값을 그대로 둔 채 `point_conflict` 로 거절한다. 덮어쓰기는 없다 — 그래야 한 번
 * 저장된 경로가 나중에 조용히 달라지지 않는다.
 */

/** client 가 보낸 점 하나. **형태를 믿지 않는다** — 호출부가 파싱하며 걸러 준다. */
export type IncomingPoint = {
  rawSeq: number;
  segment: number;
  lat: number;
  lng: number;
  /** epoch ms. DB 의 `timestamptz` 로는 여기서만 바꾼다. */
  recordedAt: number;
  accuracy: number | null;
};

export type AppendPointsInput = {
  sessionId: string;
  /** 인증된 viewer 의 id. **client 가 보낸 값이 아니다.** */
  userId: string;
  trackerToken: string;
  trackerGeneration: number;
  points: readonly IncomingPoint[];
  now: Date;
};

export type AppendPointsOutcome =
  | { ok: true; ackThroughRawSeq: number }
  /** 내 세션이 아니거나, 끝났거나, tracker token 이 맞지 않다. 셋을 구분해 알려 주지 않는다. */
  | { ok: false; error: "not_tracker" }
  /** token 은 맞지만 다른 기기가 인수해 갔다(D14). client 는 read-only 로 돌아간다. */
  | { ok: false; error: "tracker_superseded" }
  | { ok: false; error: "point_conflict"; rawSeq: number }
  | { ok: false; error: "invalid_recorded_at"; rawSeq: number }
  | { ok: false; error: "rate_limited"; retryAfterSec: number }
  | { ok: false; error: "failed" };

/**
 * `recordedAt` 이 받아들일 범위 안인가.
 *
 * 시작 전 시각과 서버보다 지나치게 앞선 시각을 거른다. **clamp 하지 않는다** — 값을 고쳐
 * 받으면 구간 시간이 달라져 끊김 판정(D10)과 속도 제외(P9)가 조용히 틀어진다.
 */
function outOfRangePoint(
  points: readonly IncomingPoint[],
  startedAt: Date,
  now: Date,
): IncomingPoint | null {
  const earliest = startedAt.getTime();
  const latest = now.getTime() + FUTURE_CLOCK_TOLERANCE_MS;

  return (
    points.find(
      (point) => point.recordedAt < earliest || point.recordedAt > latest,
    ) ?? null
  );
}

export async function appendPoints(
  input: AppendPointsInput,
): Promise<AppendPointsOutcome> {
  try {
    // ── ② 인가. 소유 · active · generation · token 해시를 **서버에서** 본다 ──────────
    const sessions = await getDb()
      .select({
        startedAt: runSessions.startedAt,
        trackerGeneration: runSessions.trackerGeneration,
        trackerTokenHash: runSessions.trackerTokenHash,
      })
      .from(runSessions)
      .where(
        and(
          eq(runSessions.id, input.sessionId),
          eq(runSessions.userId, input.userId),
          eq(runSessions.status, "active"),
        ),
      )
      .limit(1);

    const session = sessions[0];
    if (!session) return { ok: false, error: "not_tracker" };

    /*
      generation 이 서버보다 낮으면 다른 기기가 인수해 간 것이다(D14). token 이 틀린 것과는
      뜻이 달라서 client 가 할 일도 다르다 — 이쪽은 read-only 로 돌아가면 된다.
      앞선 generation 을 보내는 것은 있을 수 없는 값이라 not_tracker 로 묶는다.
    */
    if (input.trackerGeneration < session.trackerGeneration) {
      return { ok: false, error: "tracker_superseded" };
    }
    if (input.trackerGeneration !== session.trackerGeneration) {
      return { ok: false, error: "not_tracker" };
    }
    if (hashTrackerToken(input.trackerToken) !== session.trackerTokenHash) {
      return { ok: false, error: "not_tracker" };
    }

    // ── ③ rate limit. 인가를 통과한 요청만 bucket 을 건드린다 ────────────────────
    const admission = await consumeUserTokens({
      kind: "points",
      userId: input.userId,
      cost: pointsBucketCost(input.points.length),
      capacity: POINTS_BUCKET_CAPACITY,
      refillPerSecond: POINTS_BUCKET_REFILL_PER_SECOND,
    });
    if (!admission.allowed) {
      return {
        ok: false,
        error: "rate_limited",
        retryAfterSec: admission.retryAfterSec,
      };
    }

    // ── ④ 저장 ───────────────────────────────────────────────────────────────
    const invalid = outOfRangePoint(input.points, session.startedAt, input.now);
    if (invalid) {
      return {
        ok: false,
        error: "invalid_recorded_at",
        rawSeq: invalid.rawSeq,
      };
    }

    return await getDb().transaction(async (tx) => {
      const stored = await tx
        .select({
          rawSeq: routePoints.rawSeq,
          segment: routePoints.segment,
          lat: routePoints.lat,
          lng: routePoints.lng,
          recordedAt: routePoints.recordedAt,
          accuracyM: routePoints.accuracyM,
        })
        .from(routePoints)
        .where(
          and(
            eq(routePoints.sessionId, input.sessionId),
            eq(routePoints.trackerGeneration, input.trackerGeneration),
            eq(routePoints.ordinal, 0),
          ),
        )
        .orderBy(asc(routePoints.rawSeq));

      const byRawSeq = new Map(stored.map((row) => [row.rawSeq, row]));

      /*
        먼저 전부 비교한다. 하나라도 다르면 **아무것도 쓰지 않고** 돌려보낸다 —
        일부만 저장하면 client 가 어디까지 들어갔는지 알 수 없다.
        tracker 는 하나뿐이라(D14) 이 사이에 다른 writer 가 끼어들지 않는다.
      */
      const conflict = input.points.find((point) => {
        const existing = byRawSeq.get(point.rawSeq);
        if (existing === undefined) return false;

        return !isSamePayload(
          {
            segment: existing.segment,
            lat: existing.lat,
            lng: existing.lng,
            recordedAt: existing.recordedAt.getTime(),
            accuracy: existing.accuracyM,
          },
          point,
        );
      });
      if (conflict) {
        return {
          ok: false as const,
          error: "point_conflict" as const,
          rawSeq: conflict.rawSeq,
        };
      }

      const fresh = input.points.filter((point) => !byRawSeq.has(point.rawSeq));

      if (fresh.length > 0) {
        await tx
          .insert(routePoints)
          .values(
            fresh.map((point) => ({
              sessionId: input.sessionId,
              trackerGeneration: input.trackerGeneration,
              rawSeq: point.rawSeq,
              ordinal: 0,
              kind: "measured" as const,
              segment: point.segment,
              lat: point.lat,
              lng: point.lng,
              recordedAt: new Date(point.recordedAt),
              accuracyM: point.accuracy,
            })),
          )
          // 같은 배치가 겹쳐 들어와도 기존 값을 건드리지 않는다.
          .onConflictDoNothing();
      }

      const all = [
        ...stored.map((row) => row.rawSeq),
        ...fresh.map((point) => point.rawSeq),
      ].sort((a, b) => a - b);

      return { ok: true as const, ackThroughRawSeq: ackThroughRawSeq(all) };
    });
  } catch {
    // 좌표 · token 값을 로그에 남기지 않는다. 조용히 성공으로 만들지도 않는다.
    return { ok: false, error: "failed" };
  }
}
