"use server";

import { cookies } from "next/headers";

import { readAuthEnv, sessionCookieName } from "./config";
import { deleteSessionByRawToken, sessionCookieAttributes } from "./session";

/**
 * 로그아웃(F12 · R25).
 *
 * **현재 기기 세션만** 지운다 — 다른 기기의 `auth_sessions` 행은 그대로라 그쪽은 로그인 상태가
 * 유지된다. 지운 뒤 쿠키를 지우므로 이전 쿠키를 다시 써도 조회되는 행이 없어 거부된다.
 *
 * 실패하면 쿠키를 지우지 않고 `failed` 를 돌려준다. 화면은 이동하지 않고 오류를 보여야 한다
 * — 세션이 살아 있는데 로그인 화면으로 보내면 가짜 성공이다.
 *
 * 진행 중인 러닝이 있을 때 막는 P12 검사는 #81 이 `active_session` 을 추가하며 넣는다.
 * 이 Issue 시점에는 active run 이 존재할 수 없다.
 *
 * 이 파일은 `"use server"` 라서 `import "server-only"` 를 붙이지 않는다 —
 * server action 파일은 Next 가 클라이언트 번들에 넣지 않는다.
 */
export async function signOut(): Promise<
  { ok: true } | { ok: false; error: "failed" }
> {
  try {
    const { secureCookies } = readAuthEnv();
    const cookieName = sessionCookieName(secureCookies);
    const store = await cookies();
    const rawToken = store.get(cookieName)?.value;

    if (rawToken) {
      await deleteSessionByRawToken(rawToken);
    }

    // 지울 세션이 없었더라도 쿠키는 없애 둔다. 결과는 「로그아웃됨」으로 같다.
    store.set(cookieName, "", {
      ...sessionCookieAttributes(secureCookies),
      maxAge: 0,
    });

    return { ok: true };
  } catch {
    // DB 실패 등. 조용히 삼키지 않고 실패를 알린다 — 쿠키는 그대로 두므로 로그인이 유지된다.
    return { ok: false, error: "failed" };
  }
}
