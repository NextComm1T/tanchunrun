import type { AuthProvider } from "@/server/auth/config";

/**
 * 설정 화면이 보여 주는 계정 값들(#88).
 *
 * **mock 이 아니다.** 닉네임 · 제공자는 `getViewer()` 가 세션에서 준 실제 값이고, 여기 있는 것은
 * 그 값을 화면 문구로 옮기는 표뿐이다.
 *
 * 이 모듈은 **server component 에서만** 쓴다 — `AuthProvider` 타입이 `src/server` 에서 오고,
 * 타입은 컴파일에서 지워지지만 값을 가져오는 순간 `server-only` 에 걸린다.
 */

/**
 * 소셜 로그인 제공자 표기(디자인 L1146 · L1019).
 *
 * DB 에는 `kakao` · `google` 로 저장되고 화면에는 **한글이 아니라 `Kakao` · `Google`** 로 적는다.
 * 저장값을 그대로 보이지 않는 이유는 디자인이 그렇게 정했기 때문이다.
 */
export const PROVIDER_LABEL: Record<AuthProvider, string> = {
  kakao: "Kakao",
  google: "Google",
};

/** 진행 중인 러닝이 있을 때 로그아웃·탈퇴를 막고 띄우는 안내(`docs/05-policy.md:25` · P12). */
export const ACTIVE_SESSION_NOTICE = "진행 중인 러닝을 먼저 종료해 주세요";
