import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { routePoints, runSessions } from "@/server/db/schema";

import { ackAfterWrite, planAppend } from "./ack";
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
 * ① 과 본문 검사는 route(`app/api/runs/[id]/points/route.ts`)가 한다 — 선언된 크기 → ① 인증 →
 * 실제 크기(상한까지만 읽는다) → 형태 순이고, **미인증 요청은 본문을 읽지 않는다**(#115).
 * ②③④ 가 이 파일이다.
 *
 * **①② 에서 끊긴 요청은 rate-limit 행을 읽지도 소비하지도 않는다.** 그러지 않으면 남의
 * sessionId 를 아는 사람이 요청을 쏘아 그 사람의 bucket 을 고갈시킬 수 있다. 인가는
 * 이 파일이 먼저 끝내고, 그 뒤에만 `consumeUserTokens` 를 부른다.
 *
 * ## ②③④ 는 한 transaction 이고, 세션 행을 잠근 채로 돈다(#114)
 *
 * **token 소비도 같은 transaction 이다.** 예기치 않은 DB 실패로 저장이 rollback 되면 소비도
 * 함께 rollback 된다. 429 · `point_conflict` · `invalid_recorded_at` 은 정상 종료라 소비가
 * 그대로 commit 된다(#83) — `finish.ts` 의 tx1 과 같은 방식이다.
 *
 * **세션 행을 `FOR UPDATE` 로 잠그는 이유** — 기기가 하나라는 것(D14)과 in-flight 요청이
 * 하나라는 것은 다르다. 러닝 화면의 flusher 와 결과 화면의 recovery 가 겹치거나, 응답을 잃은
 * 요청이 재시도되면 같은 기기에서 POST 두 개가 겹친다. 잠그지 않으면 READ COMMITTED 에서 둘 다
 * 상대의 미commit 행을 못 보고 「새 점」으로 판정해, 같은 번호에 **다른 값**이 와도 둘 다 성공하고
 * 뒤쪽 값이 `ON CONFLICT DO NOTHING` 으로 조용히 사라진다. client 는 그 ACK 를 믿고 버퍼에서
 * 점을 지운다.
 *
 * 잠금은 이 세션에 쓰는 모든 쪽을 한 줄로 세운다 — 업로드끼리, 업로드와 종료(tx1 이 같은 행을
 * UPDATE 한다), 업로드와 인수(D14 · generation 을 올리는 UPDATE). 인가도 잠금 **아래에서**
 * 읽으므로, 인가를 통과한 뒤 저장하기 전에 세션이 끝나거나 인수되는 틈이 없다.
 *
 * - `userId` 를 WHERE 에 넣어 잠그므로 **남의 세션 행은 잠글 수 없다.**
 * - row lock 은 transaction 이 끝나면 풀린다. runtime 이 쓰는 pooled 연결(PgBouncer
 *   transaction mode · #112)에서도 안전하다 — session 수준 advisory lock 은 그렇지 않다.
 *
 * ## 저장된 raw 점은 바뀌지 않는다
 *
 * 같은 키에 **같은 값**이 다시 오면 멱등하게 성공하고(재전송 · 중복 배치), 하나라도 다르면
 * 기존 값을 그대로 둔 채 `point_conflict` 로 거절한다. 덮어쓰기는 없다 — 그래야 한 번
 * 저장된 경로가 나중에 조용히 달라지지 않는다. 판정 규칙은 `ack.ts` 의 `planAppend` 다.
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
    return await getDb().transaction(async (tx): Promise<AppendPointsOutcome> => {
      // ── ② 인가. 소유 · active · generation · token 해시를 **서버에서**, 행을 잠그고 본다 ──
      const sessions = await tx
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
        .for("update")
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

      // ── ③ rate limit. 인가를 통과한 요청만, **같은 transaction** 에서 bucket 을 건드린다 ──
      const admission = await consumeUserTokens(
        {
          kind: "points",
          userId: input.userId,
          cost: pointsBucketCost(input.points.length),
          capacity: POINTS_BUCKET_CAPACITY,
          refillPerSecond: POINTS_BUCKET_REFILL_PER_SECOND,
        },
        tx,
      );
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

      /*
        먼저 전부 비교한다. 하나라도 다르면 **아무것도 쓰지 않고** 돌려보낸다 —
        일부만 저장하면 client 가 어디까지 들어갔는지 알 수 없다. 위의 잠금 덕분에 `stored` 는
        겹쳐 들어온 다른 요청이 commit 한 점까지 반영한 값이다.
      */
      const plan = planAppend(
        stored.map((row) => ({
          rawSeq: row.rawSeq,
          segment: row.segment,
          lat: row.lat,
          lng: row.lng,
          recordedAt: row.recordedAt.getTime(),
          accuracy: row.accuracyM,
        })),
        input.points,
      );
      if (plan.kind === "conflict") {
        return { ok: false, error: "point_conflict", rawSeq: plan.rawSeq };
      }

      const inserted =
        plan.fresh.length === 0
          ? []
          : await tx
              .insert(routePoints)
              .values(
                plan.fresh.map((point) => ({
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
              /*
                잠금 아래라 여기서 충돌이 나는 경로는 없다. 그래도 남겨 두는 이유 — 그 전제가
                깨져도 기존 값을 덮어쓰지 않고, 들어가지 못한 점은 아래 `RETURNING` 에 없으므로
                ACK 에서 빠진다. client 가 다시 보내면 그때 저장된 값과 견줘진다.
              */
              .onConflictDoNothing()
              .returning({ rawSeq: routePoints.rawSeq });

      // ACK 는 **실제로 저장된 행**에서 센다 — 넣으려던 점이 아니다.
      return {
        ok: true,
        ackThroughRawSeq: ackAfterWrite(
          stored.map((row) => row.rawSeq),
          inserted.map((row) => row.rawSeq),
        ),
      };
    });
  } catch {
    /*
      좌표 · token 값을 로그에 남기지 않는다. 조용히 성공으로 만들지도 않는다.
      transaction 이 통째로 rollback 됐으므로 ③ 의 token 소비도 함께 되돌아갔다.
    */
    return { ok: false, error: "failed" };
  }
}
