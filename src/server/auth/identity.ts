import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { oauthAccounts, users } from "@/server/db/schema";

import { createSession } from "./session";
import type { AuthProvider } from "./config";

/**
 * 검증된 identity 를 user 로 바꾸고 세션을 발급한다(D2).
 *
 * **identity 는 `(provider, 검증된 sub)` 하나뿐이다.** 이미 있으면 그 user 를 쓰고, 없으면 새
 * user 를 만든다. **email · profile 로 기존 계정을 찾는 코드를 두지 않는다** — 그래서 같은
 * 사람이 카카오와 구글로 로그인하면 자동으로 이어지지 않고 UID 가 둘이 된다(P11).
 *
 * 조회 · 생성 · 세션 발급이 **한 transaction** 이다. 중간에 실패하면 user · account · session
 * 어느 것도 남지 않고, cookie 도 붙지 않는다(가짜 성공 없음).
 */

/** PostgreSQL unique_violation. 같은 계정으로 최초 로그인 2건이 동시에 들어온 경우다. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

export type SignInResult = {
  userId: string;
  rawToken: string;
};

async function runSignIn(input: {
  provider: AuthProvider;
  subject: string;
  issuedAt: Date;
}): Promise<SignInResult> {
  return getDb().transaction(async (tx) => {
    const existing = await tx
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, input.provider),
          eq(oauthAccounts.providerAccountId, input.subject),
        ),
      )
      .limit(1);

    let userId = existing[0]?.userId;

    if (!userId) {
      // 최초 로그인. 닉네임이 없으므로 `signing_up` 으로 시작한다 —
      // `active` 로 올리는 것과 `signed_up_at` 을 채우는 것은 #80 몫이다.
      const created = await tx
        .insert(users)
        .values({ accountState: "signing_up", createdAt: input.issuedAt })
        .returning({ id: users.id });

      const newUserId = created[0]?.id;
      if (!newUserId) throw new Error("Failed to create user");

      // 여기서 23505 가 나면 다른 요청이 먼저 같은 계정을 만든 것이다.
      // transaction 이 통째로 롤백되므로 방금 만든 user 행도 사라진다.
      await tx.insert(oauthAccounts).values({
        provider: input.provider,
        providerAccountId: input.subject,
        userId: newUserId,
        createdAt: input.issuedAt,
      });

      userId = newUserId;
    }

    const { rawToken } = await createSession(tx, {
      userId,
      provider: input.provider,
      issuedAt: input.issuedAt,
    });

    return { userId, rawToken };
  });
}

/**
 * `runSignIn` 을 실행하고, PK 충돌이면 **전체 rollback 후 1회만** 재시도한다.
 * 재시도에서는 상대가 이미 만들어 둔 account 를 찾게 되므로 user · account 는 각 1행으로 끝난다.
 * 그래도 실패하면 호출하는 쪽이 `failed` 로 떨어뜨린다.
 */
export async function signInWithVerifiedIdentity(input: {
  provider: AuthProvider;
  subject: string;
}): Promise<SignInResult> {
  try {
    return await runSignIn({ ...input, issuedAt: new Date() });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return runSignIn({ ...input, issuedAt: new Date() });
  }
}
