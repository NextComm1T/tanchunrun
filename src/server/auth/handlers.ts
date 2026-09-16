import "server-only";

import * as client from "openid-client";
import { NextResponse } from "next/server";

import {
  OAUTH_TRANSIENT_TTL_SECONDS,
  OAUTH_TRANSIENT_VERSION,
  isAuthProvider,
  loginErrorUrl,
  oauthCookieName,
  postLoginUrl,
  readAuthEnv,
  redirectUriFor,
  scopeFor,
  sessionCookieName,
  type AuthProvider,
} from "./config";
import { signInWithVerifiedIdentity } from "./identity";
import { getProviderConfig } from "./providers";
import { sessionCookieAttributes } from "./session";

/**
 * OAuth route 4개가 공유하는 흐름(D1 · D2).
 *
 * standard HTTPS web redirect → 서버 callback → same-origin DB session + HttpOnly cookie.
 *
 * **로그에 token · claim · cookie 값 · 개인정보를 남기지 않는다.** 실패는 전부
 * `/login?error=cancelled | failed` 로만 드러난다.
 */

/** transient cookie 에 담는 것. code verifier 가 들어 있어 반드시 HttpOnly 여야 한다. */
type OAuthTransient = {
  v: number;
  provider: AuthProvider;
  state: string;
  nonce: string;
  codeVerifier: string;
};

function parseTransient(raw: string | undefined): OAuthTransient | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const value = parsed as Record<string, unknown>;

  if (value.v !== OAUTH_TRANSIENT_VERSION) return null;
  if (typeof value.provider !== "string" || !isAuthProvider(value.provider)) {
    return null;
  }
  if (
    typeof value.state !== "string" ||
    typeof value.nonce !== "string" ||
    typeof value.codeVerifier !== "string"
  ) {
    return null;
  }

  return {
    v: value.v,
    provider: value.provider,
    state: value.state,
    nonce: value.nonce,
    codeVerifier: value.codeVerifier,
  };
}

function transientCookieAttributes(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: OAUTH_TRANSIENT_TTL_SECONDS,
  } as const;
}

/**
 * 인증 시작. state · nonce · PKCE verifier 를 만들어 provider 전용 transient cookie 에 담고
 * authorization endpoint 로 보낸다.
 *
 * `redirect_uri` 는 `APP_ORIGIN` 으로만 만든다(Host 헤더를 쓰지 않는다).
 * Google 에 `access_type=offline` 을 요청하지 않는다 — refresh token 이 필요 없다.
 */
export async function handleStart(provider: AuthProvider): Promise<Response> {
  // `handleCallback` 과 같은 이유로 try 밖이다 — env 가 없으면 돌려보낼 곳을 만들 수 없다.
  const { secureCookies } = readAuthEnv();

  try {
    const config = await getProviderConfig(provider);

    const state = client.randomState();
    const nonce = client.randomNonce();
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

    const authorizationUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: redirectUriFor(provider),
      scope: scopeFor(provider),
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const response = NextResponse.redirect(authorizationUrl, { status: 302 });
    const transient: OAuthTransient = {
      v: OAUTH_TRANSIENT_VERSION,
      provider,
      state,
      nonce,
      codeVerifier,
    };
    response.cookies.set(
      oauthCookieName(provider, secureCookies),
      JSON.stringify(transient),
      transientCookieAttributes(secureCookies),
    );

    return response;
  } catch {
    // 설정 누락 · discovery 실패 등. 원인 값을 흘리지 않고 안내로만 돌려보낸다.
    return NextResponse.redirect(loginErrorUrl("failed"), { status: 302 });
  }
}

/**
 * 인증 callback.
 *
 * transient cookie 는 **성공 · 실패와 관계없이 이 응답에서 지운다.** 그래서 실패 경로마다
 * 지우는 걸 잊지 않도록, 응답을 만드는 자리를 `finish()` 하나로 모았다.
 */
export async function handleCallback(
  provider: AuthProvider,
  request: Request,
): Promise<Response> {
  // 일부러 try 밖이다. env 가 없으면 `/login` 의 절대 URL 조차 만들 수 없어서 안내 화면으로
  // 돌려보낼 방법이 없다. 설정 오류는 조용히 숨기지 말고 그대로 500 으로 드러내는 게 맞다.
  const { secureCookies } = readAuthEnv();
  const cookieName = oauthCookieName(provider, secureCookies);

  function finish(destination: URL): NextResponse {
    const response = NextResponse.redirect(destination, { status: 302 });
    // 지울 때도 설정할 때와 같은 속성을 준다. `__Host-` cookie 는 Secure · Path=/ 가
    // 맞지 않으면 브라우저가 그냥 무시해서 지워지지 않는다.
    response.cookies.set(cookieName, "", {
      ...transientCookieAttributes(secureCookies),
      maxAge: 0,
    });
    return response;
  }

  const failed = () => finish(loginErrorUrl("failed"));

  try {
    const currentUrl = new URL(request.url);

    // provider 가 돌려준 오류가 먼저다. 사용자가 동의를 거부한 경우만 '취소' 다.
    const providerError = currentUrl.searchParams.get("error");
    if (providerError) {
      return finish(
        loginErrorUrl(providerError === "access_denied" ? "cancelled" : "failed"),
      );
    }

    // 자기 provider 의 cookie 만 읽는다. cookie 안 provider 가 route 와 다르면 실패다 —
    // Google 흐름에서 받은 cookie 로 Kakao callback 을 부르는 경우를 여기서 막는다.
    const transient = parseTransient(readCookie(request, cookieName));
    if (!transient || transient.provider !== provider) return failed();

    const config = await getProviderConfig(provider);

    // `redirect_uri` 를 `APP_ORIGIN` 기준으로 다시 만들어 넘긴다. 프록시 뒤에서 `request.url`
    // 의 origin 이 달라져도 provider 에 등록된 값과 어긋나지 않는다.
    const expectedUrl = new URL(redirectUriFor(provider));
    expectedUrl.search = currentUrl.search;

    // 서명 · iss · aud · 시각 · nonce · state · PKCE 검증은 전부 라이브러리가 한다.
    const tokens = await client.authorizationCodeGrant(config, expectedUrl, {
      expectedState: transient.state,
      expectedNonce: transient.nonce,
      pkceCodeVerifier: transient.codeVerifier,
      idTokenExpected: true,
    });

    // identity 는 검증된 `sub` 뿐이다. userinfo 를 부르지 않고
    // email · nickname · picture claim 을 읽지 않는다(SP3).
    const subject = tokens.claims()?.sub;
    if (typeof subject !== "string" || subject.length === 0) return failed();

    const { rawToken } = await signInWithVerifiedIdentity({ provider, subject });

    const response = finish(postLoginUrl());
    response.cookies.set(
      sessionCookieName(secureCookies),
      rawToken,
      sessionCookieAttributes(secureCookies),
    );
    return response;
  } catch {
    // state 불일치 · verifier 불일치 · 서명 검증 실패 · DB 실패 전부 여기로 온다.
    // 조용히 삼키지 않고 안내 있는 화면으로 돌려보낸다.
    return failed();
  }
  // token endpoint 가 준 access · refresh · id token 은 이 함수 밖으로 나가지 않는다.
}

/** `Request` 에서 cookie 하나를 읽는다. route handler 는 `cookies()` 없이 헤더로 읽어도 된다. */
function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }

  return undefined;
}
