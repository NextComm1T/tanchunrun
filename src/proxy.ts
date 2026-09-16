import { NextResponse, type NextRequest } from "next/server";

import { hasCurrentConsent } from "@/server/account/consent";
import { readAuthEnv, sessionCookieName } from "@/server/auth/config";
import { readViewerByToken } from "@/server/auth/session";

/**
 * 가입 중 사용자를 가입 흐름 안에 붙잡아 두는 **서버 가드**(#80 · P11).
 *
 * 왜 화면마다가 아니라 여기인가 — 막아야 할 화면(`/home` · `/records` · `/settings` …)이
 * #81 · #88 소유 파일이라 각 페이지에 가드를 넣으면 소유 경계를 넘는다. #80 본문이 루트
 * `proxy.ts` 를 이 용도로 신규 · 허용으로 지정했다.
 *
 * Next 16 에서 `proxy.ts` 는 **항상 Node.js runtime** 이라 DB 를 볼 수 있다(`middleware`
 * 시절의 Edge 제약이 없다). 그래서 opaque 세션 token 을 여기서 조회할 수 있다.
 *
 * **이 가드는 인가(authorization)를 대신하지 않는다.** 서버 함수는 각자 `getViewer()` 로
 * 권한을 다시 본다 — 여기서 하는 일은 길 안내뿐이다.
 *
 * 로그아웃 사용자는 막지 않는다. #80 의 계약은 「가입 중」만이고, 로그인 없이 볼 수 있는
 * 화면들은 아직 전부 mock 이라 새는 데이터가 없다. 실데이터가 붙는 #81 이후 각 화면이 막는다.
 */

/**
 * 가입 중에도 갈 수 있는 곳.
 *
 * `/privacy-policy` 가 들어 있는 이유 — 동의 화면의 「개인정보처리방침 보기」가 그리로 가는데,
 * 막아 버리면 동의 여부를 판단할 문서를 읽을 수 없게 된다.
 */
const SIGNUP_FLOW_PREFIXES = ["/signup", "/privacy-policy"];

function isInsideSignupFlow(pathname: string): boolean {
  return SIGNUP_FLOW_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isInsideSignupFlow(pathname)) return NextResponse.next();

  const { secureCookies } = readAuthEnv();
  const rawToken = request.cookies.get(sessionCookieName(secureCookies))?.value;

  // 로그아웃 상태는 이 가드의 대상이 아니다. DB 도 보지 않는다.
  if (!rawToken) return NextResponse.next();

  const viewer = await readViewerByToken(rawToken);
  if (!viewer || viewer.accountState !== "signing_up") {
    return NextResponse.next();
  }

  const resume = (await hasCurrentConsent(viewer.userId))
    ? "/signup/nickname"
    : "/signup/consent";

  return NextResponse.redirect(new URL(resume, request.url));
}

export const config = {
  /**
   * 루트 `/` 는 제외한다 — 거기서는 `app/page.tsx` 가 네 갈래를 모두 판단하므로 proxy 가
   * 먼저 끼어들면 같은 조회를 두 번 한다.
   *
   * `/login` · `/api` 도 제외한다. 로그인 화면을 막으면 가입 중 사용자가 로그아웃할 수 없고,
   * OAuth callback 을 막으면 로그인 자체가 끝나지 않는다.
   *
   * 정적 자원(`_next` · 확장자가 있는 파일)을 빼는 것은 성능 문제다 — 그것까지 통과시키면
   * 이미지 한 장마다 세션 조회가 돈다.
   */
  matcher: [
    "/((?!api|login|_next/static|_next/image|favicon.ico|.*\\.[^/]+$|$).*)",
  ],
};
