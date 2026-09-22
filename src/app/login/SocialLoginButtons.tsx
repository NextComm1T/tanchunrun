/**
 * 소셜 로그인 시작점(F8 · R13 · #79).
 *
 * 버튼이 아니라 **평범한 링크**다. 누르면 `/api/auth/<provider>/start` 로 전체 페이지 이동하고,
 * 그 route handler 가 state · nonce · PKCE verifier 를 심은 뒤 provider 로 302 한다.
 *
 * - `next/link` 를 쓰지 않는다 — 저 경로는 화면이 아니라 route handler 라서 클라이언트 라우터가
 *   가로채면 안 되고, typed routes 의 화면 목록에도 없다.
 * - `<a>` 라서 이 조각은 더 이상 클라이언트 컴포넌트가 아니다. 이동은 브라우저가 하므로
 *   JS 가 실리기 전에 눌러도 동작한다. 모양은 `<button>` 일 때와 같다(클래스 그대로).
 *
 * 실패 · 취소하면 callback 이 `/login?error=cancelled` · `/login?error=failed` 로 돌려보내고,
 * 이 화면(`page.tsx`)이 이미 그 값을 읽어 안내를 띄운다.
 */
export function SocialLoginButtons() {
  return (
    <>
      <a
        href="/api/auth/kakao/start"
        className="flex h-[58px] w-full items-center gap-3 rounded-xl bg-kakao px-[22px] text-button font-extrabold text-foreground shadow-button"
      >
        <KakaoIcon />
        <span className="flex-1 text-center">카카오로 계속하기</span>
      </a>

      <a
        href="/api/auth/google/start"
        className="flex h-[58px] w-full items-center gap-3 rounded-xl border-[1.5px] border-border bg-surface px-[22px] text-button font-extrabold text-foreground shadow-button-soft"
      >
        <GoogleIcon />
        <span className="flex-1 text-center">Google로 계속하기</span>
      </a>

      {/*
        **발표 검토용 임시 버튼(#246). 발표가 끝나면 이 조각과 `/api/auth/test` 를 함께 지운다.**

        구글 OAuth 앱이 미검증이라 외부 계정은 로그인 자체가 막힌다. 검토자가 화면을 눌러 볼 수
        있도록 계정 하나로만 들어오는 문을 임시로 연다.

        링크가 아니라 **form POST** 다 — 주소를 누르거나 프리페치하는 것으로는 세션이 생기지 않는다.
      */}
      <form action="/api/auth/test" method="post" className="w-full">
        <button
          type="submit"
          className="flex h-[58px] w-full items-center justify-center rounded-xl border-[1.5px] border-dashed border-border bg-surface-muted px-[22px] text-content font-bold text-subtle"
        >
          테스트 계정으로 둘러보기
        </button>
      </form>
    </>
  );
}

function KakaoIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 3C6.9 3 3 6.3 3 10.3c0 2.6 1.7 4.9 4.3 6.2-.2.7-.7 2.6-.8 3 0 0-.1.4.2.5.3.1.6-.1.6-.1.6-.4 3-2.1 3.7-2.6.3 0 .6.1 1 .1 5.1 0 9-3.3 9-7.1S17.1 3 12 3z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
