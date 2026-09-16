import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { isUniqueViolation } from "@/server/db/errors";
import { runSessions } from "@/server/db/schema";

import { issueTrackerToken } from "./tracker";

/**
 * 러닝 세션의 시작 · 조회 · tracker 인수(#81 · D8 · D14).
 *
 * **모든 함수가 userId 를 인자로 받지만 그 값은 언제나 세션에서 온다.** 이 모듈을 부르는
 * server action 이 `getViewer()` 로 얻어 넘긴다 — client 가 보낸 userId 가 여기까지 오는 길은 없다.
 */

/** 새 러닝의 시작 시각과 tracker. `trackerToken` 은 **이때 한 번만** client 로 나간다. */
export type StartedRun = {
  sessionId: string;
  startedAt: Date;
  trackerToken: string;
  trackerGeneration: number;
};

/** 진행 중인 러닝. token 은 들어 있지 않다 — 복원은 client 의 IndexedDB 가 한다. */
export type ActiveRun = {
  sessionId: string;
  startedAt: Date;
  trackerGeneration: number;
};

/**
 * 시작 시각의 Asia/Seoul 날짜(`YYYY-MM-DD`).
 *
 * 자정을 넘겨 달려도 **시작한 날**로 묶인다. `en-CA` 로케일이 ISO 와 같은 `YYYY-MM-DD` 를
 * 주므로 직접 문자열을 조립하지 않는다(월·일 0 패딩을 손으로 하다 틀리는 자리다).
 */
function seoulRunDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * 러닝을 시작한다.
 *
 * **중복 시작을 미리 조회해서 막지 않는다.** 조회하고 INSERT 하는 사이에 다른 기기가 끼어들
 * 수 있어서, 두 기기가 동시에 누르면 둘 다 통과한다. 그래서 그냥 INSERT 하고
 * `run_sessions_active_user_unique` 위반(`23505`)을 `active_exists` 로 바꾼다 —
 * DB 가 반드시 한쪽만 통과시킨다(P7).
 */
export async function createRun(
  userId: string,
): Promise<StartedRun | { error: "active_exists" | "failed" }> {
  const startedAt = new Date();
  const { rawToken, tokenHash } = issueTrackerToken();

  try {
    const created = await getDb()
      .insert(runSessions)
      .values({
        userId,
        status: "active",
        startedAt,
        runDate: seoulRunDate(startedAt),
        trackerGeneration: 1,
        trackerTokenHash: tokenHash,
      })
      .returning({
        id: runSessions.id,
        startedAt: runSessions.startedAt,
        trackerGeneration: runSessions.trackerGeneration,
      });

    const row = created[0];
    if (!row) return { error: "failed" };

    return {
      sessionId: row.id,
      startedAt: row.startedAt,
      trackerToken: rawToken,
      trackerGeneration: row.trackerGeneration,
    };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "active_exists" };

    // 좌표 · token 값을 로그에 남기지 않는다. 조용히 삼키지도 않는다.
    return { error: "failed" };
  }
}

/** 이 사용자의 진행 중인 러닝. **본인 것만 본다.** */
export async function findActiveRun(userId: string): Promise<ActiveRun | null> {
  const rows = await getDb()
    .select({
      sessionId: runSessions.id,
      startedAt: runSessions.startedAt,
      trackerGeneration: runSessions.trackerGeneration,
    })
    .from(runSessions)
    .where(and(eq(runSessions.userId, userId), eq(runSessions.status, "active")))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * tracker 를 이 기기로 가져온다(D14 — 사용자가 명시적으로 고른 경우에만).
 *
 * **한 UPDATE 로 끝난다.** generation 을 올리는 것과 token 을 바꾸는 것이 따로 일어나면
 * 그 사이에 옛 token 으로 새 generation 에 쓸 수 있는 틈이 생긴다.
 *
 * generation 이 오르는 순간 이전 generation 은 봉인된다 — 구 기기가 이후 보내는 요청은
 * generation 이 맞지 않아 거부된다(그 거부를 `tracker_superseded` 로 돌려주는 것은 업로드 ·
 * 종료를 맡는 #83 · #85 다).
 *
 * **이미 서버에 저장된 이전 generation 의 점은 지우지 않는다.**
 */
export async function takeoverTracker(
  userId: string,
  sessionId: string,
): Promise<
  | { trackerToken: string; trackerGeneration: number }
  | { error: "not_found" | "failed" }
> {
  const { rawToken, tokenHash } = issueTrackerToken();

  try {
    const updated = await getDb()
      .update(runSessions)
      .set({
        // 읽어서 +1 한 값을 쓰면 두 기기가 동시에 인수할 때 같은 generation 이 나온다.
        // DB 안에서 증가시켜야 한 번에 하나씩 올라간다.
        trackerGeneration: sql`${runSessions.trackerGeneration} + 1`,
        trackerTokenHash: tokenHash,
      })
      .where(
        and(
          eq(runSessions.id, sessionId),
          eq(runSessions.userId, userId),
          eq(runSessions.status, "active"),
        ),
      )
      .returning({ trackerGeneration: runSessions.trackerGeneration });

    const row = updated[0];
    // 남의 세션이거나 이미 끝난 세션이다. 둘을 구분해 알려 주지 않는다.
    if (!row) return { error: "not_found" };

    return { trackerToken: rawToken, trackerGeneration: row.trackerGeneration };
  } catch {
    return { error: "failed" };
  }
}
