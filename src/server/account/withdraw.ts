import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { runSessions, users } from "@/server/db/schema";

/**
 * 회원 탈퇴 — 계정 삭제(#88 · F13 · P12 · P13 · D11).
 *
 * **지우는 것은 `users` 행 하나뿐이다.** 나머지는 전부 `ON DELETE CASCADE` 로 따라 사라진다 —
 * `oauth_accounts`(계정 연결) · `auth_sessions`(모든 기기 세션) · `consents` · `run_sessions` ·
 * `route_points` · `rate_limits`. 테이블을 하나씩 지우는 코드를 두지 않는 이유는 **테이블이
 * 늘어날 때 빠뜨리기 때문**이다. FK 에 맡기면 스키마가 삭제 범위를 스스로 보장한다.
 *
 * 물리 테이블로 된 개인 최고 기록 · 랭킹 집계는 **없다**(D6 = B — `run_sessions` 의
 * `save_state = 'saved'` 에서 파생한다). 그래서 그 둘은 이 삭제에 나오지 않는다.
 *
 * `rate_limits` 는 #83 이 만들 때부터 FK 를 CASCADE 로 뒀다(D11). 이 Issue 는 rate-limit
 * migration 을 새로 만들지 않는다.
 */

export type WithdrawError = "active_session" | "failed";

/**
 * 계정을 지운다. **진행 중인 러닝이 있으면 지우지 않는다**(P12).
 *
 * 왜 transaction 안에서 `FOR UPDATE` 로 행을 먼저 잠그는가 — 검사와 삭제 사이에 다른 기기가
 * 러닝을 시작할 수 있기 때문이다. `users` 행을 `FOR UPDATE` 로 잡으면 그 사이에 들어오는
 * `run_sessions` INSERT 는 FK 검사에서 같은 행의 KEY SHARE 잠금을 기다리다 막힌다. 이쪽이
 * 커밋되면 그 INSERT 는 FK 위반으로 떨어지고, 반대로 그쪽이 먼저면 여기서 active 를 본다.
 * 검사 → 삭제를 따로 두 문장으로 보내면 그 틈에 시작한 러닝이 조용히 함께 지워진다.
 *
 * 실패하면 **아무것도 지우지 않는다.** 중간까지 지우고 멈추는 상태가 없어야 화면이
 * "탈퇴 완료"를 거짓으로 말하지 않는다.
 */
export async function deleteAccount(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: WithdrawError }> {
  return getDb().transaction(async (tx) => {
    const locked = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1);

    // 이미 없는 계정이다. 「지웠다」고 말하지 않는다 — 세션은 있는데 user 가 없는 상태라
    // 정상 흐름에서는 나올 수 없고, 화면은 다시 시도를 보여야 한다.
    if (locked.length === 0) return { ok: false, error: "failed" } as const;

    const active = await tx
      .select({ id: runSessions.id })
      .from(runSessions)
      .where(
        and(eq(runSessions.userId, userId), eq(runSessions.status, "active")),
      )
      .limit(1);

    /*
      오프라인으로 종료해 서버에는 아직 `active` 로 남아 있는 기간도 여기에 걸린다 —
      상태 컬럼만 보기 때문이다. 화면이 버튼을 막는 것과 별개로 서버가 다시 본다.
    */
    if (active.length > 0) {
      return { ok: false, error: "active_session" } as const;
    }

    const deleted = await tx
      .delete(users)
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (deleted.length === 0) return { ok: false, error: "failed" } as const;

    return { ok: true } as const;
  });
}
