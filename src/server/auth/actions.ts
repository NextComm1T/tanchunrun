"use server";

import { cookies } from "next/headers";

import { readAuthEnv, sessionCookieName } from "./config";
import {
  deleteSessionByRawToken,
  getViewer,
  sessionCookieAttributes,
} from "./session";

/**
 * 로그아웃(F12 · R25).
 *
 * **현재 기기 세션만** 지운다 — 다른 기기의 `auth_sessions` 행은 그대로라 그쪽은 로그인 상태가
 * 유지된다. 지운 뒤 쿠키를 지우므로 이전 쿠키를 다시 써도 조회되는 행이 없어 거부된다.
 *
 * 실패하면 쿠키를 지우지 않고 `failed` 를 돌려준다. 화면은 이동하지 않고 오류를 보여야 한다
 * — 세션이 살아 있는데 로그인 화면으로 보내면 가짜 성공이다.
 *
 * **진행 중인 러닝이 있으면 로그아웃하지 않는다**(P12 · #81). 서버가 검사하는 것이 핵심이다 —
 * 설정 화면이 버튼을 감추기도 하지만, 그건 안내일 뿐 검증이 아니다. 이 action 을 직접
 * 호출해도 여기서 막힌다.
 *
 * 막혔을 때는 **세션 행도 쿠키도 건드리지 않는다.** 지우고 나서 거절하면 로그인은 풀렸는데
 * 화면은 로그인 상태로 남는다.
 *
 * 이 파일은 `"use server"` 라서 `import "server-only"` 를 붙이지 않는다 —
 * server action 파일은 Next 가 클라이언트 번들에 넣지 않는다.
 */
export async function signOut(): Promise<
  { ok: true } | { ok: false; error: "active_session" | "failed" }
> {
  try {
    const { secureCookies } = readAuthEnv();
    const cookieName = sessionCookieName(secureCookies);
    const store = await cookies();
    const rawToken = store.get(cookieName)?.value;

    // 지우기 **전에** 검사한다.
    const viewer = await getViewer();
    if (viewer?.hasActiveRun) {
      return { ok: false, error: "active_session" };
    }

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
