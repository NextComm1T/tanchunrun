import { AppShell } from "@/components/shared/AppShell";
import { Header } from "@/components/shared/Header";
import type { AuthProvider } from "@/server/auth/config";
import { getViewer } from "@/server/auth/session";

import { ConsentForm } from "./ConsentForm";
import { PrivacyPolicyCard } from "./PrivacyPolicyCard";

/**
 * 가입 절차를 시작한 소셜 제공자 이름(디자인 L105 · L1146).
 *
 * 값은 **세션에서 온다**(#156). 예전에는 `?provider=` 쿼리로 받았는데, 실제 가입 흐름은
 * 콜백 → `/`(`src/app/page.tsx`) → `/signup/consent` 라 그 쿼리를 붙이는 곳이 없었다.
 * 그래서 진짜 가입자는 늘 아래 fallback 문구를 봤고, 반대로 주소창에 값을 넣으면 아무나
 * 다른 제공자 이름을 띄울 수 있었다. 로그인한 세션은 이미 제공자를 안다.
 *
 * 설정 화면(`src/app/settings/profile.ts`)은 같은 값을 `Kakao` 로 적는다. 두 화면의 표기가
 * 갈려 있는데, 어느 쪽으로 맞출지는 이 Issue 범위 밖이라 그대로 뒀다
 * (`modify/2026-09-18-signup-consent-provider.md` 2번).
 */
const PROVIDER_LABELS: Record<AuthProvider, string> = {
  kakao: "카카오",
  google: "Google",
};

/**
 * 제공자를 모를 때 쓰는 문구. 디자인에는 없는 문장이다(modify 기록 3번).
 *
 * 세션을 보게 된 뒤에도 남는다 — `proxy.ts` 는 `/signup/*` 를 통과시키고 이 화면에는
 * 가드가 없어서, **로그아웃 상태로 주소를 직접 열면** `getViewer()` 가 `null` 이다.
 * 여기서 로그인 화면으로 돌려보내는 것은 인증 흐름 변경이라 이 Issue 범위 밖이다.
 */
const UNKNOWN_PROVIDER_LABEL = "소셜";

/**
 * 가입하기(개인정보 수집·이용 동의) 화면 — 디자인 L95-135.
 *
 * 공통 완료 기준의 네 상태(docs/07-screens.md:12) 중 이 화면에 있는 것은 여전히
 * 「정상」뿐이다. 제공자 이름 때문에 세션을 한 번 읽지만 server component 가 기다렸다가
 * 그리므로 불러오는 중이 없고, 비어 있을 대상도 없다 — 근거는
 * `modify/2026-09-14-signup-consent.md` 5번과 `modify/2026-09-18-signup-consent-provider.md` 3번.
 */
export default async function SignupConsentPage() {
  const viewer = await getViewer();
  const providerLabel = viewer
    ? PROVIDER_LABELS[viewer.provider]
    : UNKNOWN_PROVIDER_LABEL;

  return (
    <AppShell header={<Header title="가입하기" showBack backHref="/login" />}>
      <h2 className="mb-2.5 pt-[22px] text-metric leading-[normal] font-extrabold tracking-[-0.5px]">
        서비스 이용을 위해
        <br />
        아래 내용을 확인해주세요.
      </h2>
      <p className="mb-[22px] text-content leading-[1.6] font-medium text-muted">
        {providerLabel} 계정으로 가입을 진행합니다.
      </p>

      {/*
        정책 카드는 상태가 없다. children 으로 넘겨 서버 렌더로 남긴다
        (AppShell 의 슬롯과 같은 방식).
      */}
      <ConsentForm>
        <PrivacyPolicyCard />
      </ConsentForm>
    </AppShell>
  );
}
