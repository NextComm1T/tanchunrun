import { NextResponse } from "next/server";

import {
  loginErrorUrl,
  postLoginUrl,
  readAuthEnv,
  sessionCookieName,
} from "@/server/auth/config";
import { signInWithVerifiedIdentity } from "@/server/auth/identity";
import { sessionCookieAttributes } from "@/server/auth/session";

/**
 * **발표 검토용 임시 로그인 경로다(#246). 발표가 끝나면 지운다.**
 *
 * 왜 두는가 — 구글 OAuth 앱이 아직 미검증이라 외부 계정을 테스트 사용자로 등록하지 않으면
 * 로그인 자체가 막힌다. 검토자가 화면을 눌러 볼 수 있도록 **계정 하나로만** 들어오는 문을
 * 임시로 연다. 팀 결정(#78 D3-A)과 `CLAUDE.md` §6 의 예외이며, 그 사실을 이 주석과 #246 에 남긴다.
 *
 * 무엇을 하지 않는지가 중요하다.
 *
 * - **입력을 받지 않는다.** userId · provider · subject 중 어느 것도 요청에서 읽지 않는다.
 *   아래 상수 하나로만 로그인되므로 **다른 사용자를 사칭할 수 없다.**
 * - **GET 을 만들지 않는다.** 링크 클릭 · 프리페치 · 크롤러로 세션이 생기지 않게 POST 전용이다.
 * - 세션 발급은 OAuth callback 과 **같은 함수**(`signInWithVerifiedIdentity`)를 쓴다. 쿠키 속성 ·
 *   30일 고정 수명 · 해시 저장 방식이 실제 로그인과 동일하다. 검증만 건너뛴다.
 *
 * 이 계정의 러닝 · 랭킹은 **실제 사용자와 같은 DB 를 쓴다.** 랭킹에 함께 잡히는 것이 목적이다.
 */

/*
  `oauth_accounts.provider` 에 CHECK 제약(`google` · `kakao` 만 허용)이 걸려 있어 `test` 를 쓰려면
  production DB migration 이 필요하다. 발표 당일에 스키마를 건드리지 않으려고 provider 는 `kakao` 로
  두고, **실제 카카오 sub 로는 나올 수 없는 문자열**로 계정을 가른다(카카오 sub 는 숫자다).
  그래서 이 계정은 진짜 카카오 로그인으로는 절대 열리지 않는다.
*/
const TEST_PROVIDER = "kakao" as const;
const TEST_SUBJECT = "test-account-presentation-review";

export async function POST(): Promise<Response> {
  const { secureCookies } = readAuthEnv();

  try {
    const { rawToken } = await signInWithVerifiedIdentity({
      provider: TEST_PROVIDER,
      subject: TEST_SUBJECT,
    });

    // 303 이라야 POST 다음 이동이 GET 이 된다.
    const response = NextResponse.redirect(postLoginUrl(), { status: 303 });
    response.cookies.set(
      sessionCookieName(secureCookies),
      rawToken,
      sessionCookieAttributes(secureCookies),
    );
    return response;
  } catch {
    // DB 실패 등. OAuth 흐름과 같은 자리로 돌려보낸다 — 조용히 삼키지 않는다.
    return NextResponse.redirect(loginErrorUrl("failed"), { status: 303 });
  }
}
