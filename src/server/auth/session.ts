import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";

import { getDb } from "@/server/db/client";
import { authSessions, users } from "@/server/db/schema";

import {
  SESSION_TTL_MS,
  SESSION_TTL_SECONDS,
  readAuthEnv,
  sessionCookieName,
  type AuthProvider,
} from "./config";

/**
 * 기기별 로그인 세션(D2).
 *
 * token 은 server 가 만든 **opaque 256-bit** 값이다. 서명도 claim 도 없어서 위조하려면
 * 값을 맞히는 수밖에 없고, DB 에는 SHA-256 hex 만 둔다 — DB 가 통째로 새도 쿠키를 만들 수 없다.
 *
 * **TTL 은 발급 후 고정 30일이고 읽을 때 연장하지 않는다.** `getViewer()` 가 read path 에서
 * DB write 를 하지 않는 이유다.
 */

export type Viewer = {
  userId: string;
  accountState: string;
  nickname: string | null;
  provider: AuthProvider;
};

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * 세션 행을 만들고 raw token 을 돌려준다. **raw token 은 cookie 로만 나가고 DB 에 남지 않는다.**
 *
 * `createdAt` · `expiresAt` 을 같은 `issuedAt` 하나에서 계산해서
 * `expires_at = created_at + 30일` 이 오차 없이 성립한다.
 *
 * 호출하는 쪽이 transaction 을 주면 그 안에서 실행된다(최초 로그인의 user · account 생성과
 * 같은 transaction 에 묶기 위해서다).
 */
export async function createSession(
  db: Pick<ReturnType<typeof getDb>, "insert">,
  input: { userId: string; provider: AuthProvider; issuedAt: Date },
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(input.issuedAt.getTime() + SESSION_TTL_MS);

  await db.insert(authSessions).values({
    userId: input.userId,
    provider: input.provider,
    tokenHash: hashToken(rawToken),
    createdAt: input.issuedAt,
    expiresAt,
  });

  return { rawToken, expiresAt };
}

/**
 * 모든 서버 가드의 출발점.
 *
 * `{ userId, accountState, nickname, provider }` 는 **B1 단계 최소 계약**이다.
 * `hasActiveRun` 은 #81 이 기존 필드 · 의미를 바꾸지 않고 additive 하게 추가한다 —
 * 이 Issue 에서 미리 만들거나 고정값을 넣지 않는다.
 */
export async function getViewer(): Promise<Viewer | null> {
  // `cookies()` 를 **가장 먼저** 부른다. 이 호출이 「이 화면은 요청마다 그린다」는 표시라서,
  // 정적 생성 중이면 여기서 빠져나간다. env 를 먼저 읽으면 그 전에 누락 오류가 나서
  // `npm run build` 가 env · DB 없이 통과해야 한다는 요구(#79)가 깨진다.
  const store = await cookies();
  const { secureCookies } = readAuthEnv();
  const rawToken = store.get(sessionCookieName(secureCookies))?.value;
  if (!rawToken) return null;

  return readViewerByToken(rawToken);
}

/**
 * raw token 하나로 viewer 를 찾는다. `getViewer()` 의 조회 부분이다.
 *
 * 따로 꺼내 둔 이유는 **`proxy.ts` 때문**이다. proxy 는 `next/headers` 의 `cookies()` 를 쓸 수
 * 없고 `request.cookies` 에서 값을 직접 꺼내므로, cookie 를 읽는 부분과 DB 를 보는 부분이
 * 나뉘어 있어야 한다. 해시 계산과 만료 검사를 두 벌로 만들지 않으려는 것이다.
 */
export async function readViewerByToken(
  rawToken: string,
): Promise<Viewer | null> {
  const rows = await getDb()
    .select({
      userId: users.id,
      accountState: users.accountState,
      nickname: users.nickname,
      provider: authSessions.provider,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(
      and(
        eq(authSessions.tokenHash, hashToken(rawToken)),
        // 만료를 서버가 강제한다. cookie 가 살아 있어도 지난 세션은 없는 것과 같다.
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    userId: row.userId,
    accountState: row.accountState,
    nickname: row.nickname,
    provider: row.provider as AuthProvider,
  };
}

/**
 * 현재 기기의 세션 행을 지운다. 지울 행이 없었는지는 호출하는 쪽에 알려 준다 —
 * 이미 없는 세션을 지우는 것도 로그아웃으로서는 성공이다.
 */
export async function deleteSessionByRawToken(rawToken: string): Promise<void> {
  await getDb()
    .delete(authSessions)
    .where(eq(authSessions.tokenHash, hashToken(rawToken)));
}

/** 응답에 붙일 세션 cookie 속성. `Max-Age` 30일이라 브라우저를 닫아도 남는다(persistent). */
export function sessionCookieAttributes(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  } as const;
}
