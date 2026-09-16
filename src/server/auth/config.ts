import "server-only";

import { AUTH_PROVIDERS, type AuthProvider } from "@/server/db/schema";

export { AUTH_PROVIDERS };
export type { AuthProvider };

/**
 * 인증 설정 · 상수(#79 · D2 · D3-A).
 *
 * **여기서 secret 값을 읽어 로그 · 응답에 내보내지 않는다.** 누락을 알릴 때도 변수 *이름*만 말한다.
 */

/** 세션 수명. 발급 후 고정 30일이고 써도 연장하지 않는다(rolling 없음 · D2). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

/** OAuth 왕복에만 쓰는 transient cookie 수명. */
export const OAUTH_TRANSIENT_TTL_SECONDS = 600;

/** transient cookie 안 payload 형식이 바뀌면 올린다. 옛 cookie 는 실패로 떨어진다. */
export const OAUTH_TRANSIENT_VERSION = 1;

/** provider 별 요청 scope. **email scope 를 절대 넣지 않는다**(SP3). */
const PROVIDER_SCOPES: Record<AuthProvider, string> = {
  google: "openid profile",
  kakao: "openid",
};

const PROVIDER_ISSUERS: Record<AuthProvider, string> = {
  google: "https://accounts.google.com",
  kakao: "https://kauth.kakao.com",
};

export function isAuthProvider(value: string): value is AuthProvider {
  return (AUTH_PROVIDERS as readonly string[]).includes(value);
}

export function scopeFor(provider: AuthProvider): string {
  return PROVIDER_SCOPES[provider];
}

export function issuerFor(provider: AuthProvider): URL {
  return new URL(PROVIDER_ISSUERS[provider]);
}

/**
 * #79 · D2 가 정한 **서버 전용 env 6개**. 전부 서버에서만 읽고 `NEXT_PUBLIC_` 으로 옮기지 않는다.
 * 시작 시 존재 검사(`assertStartupEnv`)와 `.env.example` 이 같은 목록을 본다.
 */
export const REQUIRED_SERVER_ENV = [
  "DATABASE_URL",
  "APP_ORIGIN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "KAKAO_CLIENT_ID",
  "KAKAO_CLIENT_SECRET",
] as const;

export type AuthEnv = {
  appOrigin: URL;
  /** `APP_ORIGIN` 이 https 인가. cookie 의 Secure · `__Host-` prefix 를 이걸로 정한다. */
  secureCookies: boolean;
  credentials: Record<AuthProvider, { clientId: string; clientSecret: string }>;
};

let cached: AuthEnv | undefined;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * env 를 읽고 검사한다. **module top-level 이 아니라 첫 사용 시점에 부른다.**
 *
 * `next build` 는 route 모듈을 적재하면서 이 파일도 평가한다. top-level 에서 던지면
 * env 없이 빌드하는 것 자체가 막히고, 「`npm run build` 가 DB 연결 · migration 없이 통과」
 * 라는 요구를 깬다. 그래서 검사 시점을 요청 처리로 미룬다 — 대신 첫 요청에서 바로 죽는다.
 */
export function readAuthEnv(): AuthEnv {
  if (cached) return cached;

  const missing: string[] = [];
  function required(name: string): string {
    const value = process.env[name];
    if (!value) {
      missing.push(name);
      return "";
    }
    return value;
  }

  const rawOrigin = required("APP_ORIGIN");
  const googleClientId = required("GOOGLE_CLIENT_ID");
  const googleClientSecret = required("GOOGLE_CLIENT_SECRET");
  const kakaoClientId = required("KAKAO_CLIENT_ID");
  const kakaoClientSecret = required("KAKAO_CLIENT_SECRET");

  if (missing.length > 0) {
    // 이름만 말한다. 값은 어디에도 남기지 않는다.
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }

  let appOrigin: URL;
  try {
    appOrigin = new URL(rawOrigin);
  } catch {
    throw new Error("APP_ORIGIN is not a valid absolute URL");
  }

  const isHttps = appOrigin.protocol === "https:";
  const isLoopbackHttp =
    appOrigin.protocol === "http:" && LOOPBACK_HOSTS.has(appOrigin.hostname);

  // http 는 localhost 계열에서만 허용한다. 배포 origin 이 http 면 여기서 멈춘다 —
  // NODE_ENV 가 아니라 APP_ORIGIN 자체로 판단해야 `npm run start` 로 로컬에서
  // 프로덕션 빌드를 확인하는 경우를 막지 않는다.
  if (!isHttps && !isLoopbackHttp) {
    throw new Error("APP_ORIGIN must use https outside localhost");
  }

  cached = {
    appOrigin,
    secureCookies: isHttps,
    credentials: {
      google: { clientId: googleClientId, clientSecret: googleClientSecret },
      kakao: { clientId: kakaoClientId, clientSecret: kakaoClientSecret },
    },
  };

  return cached;
}

/**
 * **서버 시작 시 한 번** 부른다(`src/instrumentation.ts`). #79 의 "시작 시 누락 fail-fast" 다.
 *
 * - 6개 env 의 **존재만** 본다. 값은 읽어도 어디에도 내보내지 않고, 오류 메시지에도 **이름만** 넣는다.
 * - **DB 에 접속하지 않고 migration 도 돌리지 않는다.** `DATABASE_URL` 은 설정 여부만 본다.
 * - `readAuthEnv()` 를 이어서 불러 `APP_ORIGIN` 의 형식 · 프로토콜 규칙까지 시작 시 걸러 낸다.
 *   결과가 캐시되므로 첫 요청이 이걸 다시 계산하지 않는다.
 *
 * `register()` 는 `next build` 에서는 돌지 않으므로, 이 검사가 있어도 env · DB 없이 빌드된다.
 * 첫 사용 시점 검사(`readAuthEnv` · `getDb`)는 defense-in-depth 로 그대로 둔다 —
 * instrumentation 이 없는 실행 경로에서도 조용히 통과하면 안 되기 때문이다.
 */
export function assertStartupEnv(): void {
  const missing = REQUIRED_SERVER_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }

  readAuthEnv();
}

/**
 * cookie 이름. https 면 `__Host-` prefix 를 붙인다 — 브라우저가 Secure · Path=/ · Domain 없음을
 * 강제해 준다. http localhost 에서는 Secure 를 줄 수 없어 prefix 도 쓸 수 없다.
 */
export function sessionCookieName(secure: boolean): string {
  return secure ? "__Host-tcr_session" : "tcr_session";
}

export function oauthCookieName(
  provider: AuthProvider,
  secure: boolean,
): string {
  return secure ? `__Host-tcr_oauth_${provider}` : `tcr_oauth_${provider}`;
}

/**
 * redirect URI. **`APP_ORIGIN` 으로만 만든다 — Host 헤더를 쓰지 않는다.**
 * 헤더로 만들면 Host 를 바꿔 넣은 요청이 등록되지 않은 곳으로 코드를 흘릴 수 있다.
 */
export function redirectUriFor(provider: AuthProvider): string {
  const { appOrigin } = readAuthEnv();
  return new URL(`/api/auth/${provider}/callback`, appOrigin).toString();
}

/** 로그인 화면으로 돌아갈 절대 URL. 실패 계약은 `/login?error=cancelled | failed` 다. */
export function loginErrorUrl(reason: "cancelled" | "failed"): URL {
  const { appOrigin } = readAuthEnv();
  const url = new URL("/login", appOrigin);
  url.searchParams.set("error", reason);
  return url;
}

/** 인증 성공 뒤 착지점. 상태별 분기는 #80 이 `/` 에 넣는다. */
export function postLoginUrl(): URL {
  const { appOrigin } = readAuthEnv();
  return new URL("/", appOrigin);
}
