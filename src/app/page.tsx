import { redirect } from "next/navigation";

import { hasCurrentConsent } from "@/server/account/consent";
import { getViewer } from "@/server/auth/session";

/**
 * 앱 진입점 — 인증 상태에 따른 분기(#80 · `docs/07-screens.md:35-38`).
 *
 *   로그아웃              → 로그인 화면
 *   가입 중 · 동의 전     → 동의 화면
 *   가입 중 · 동의 후     → 닉네임 설정 화면
 *   진행 중 세션 있음     → 러닝 진행 화면(이어서 측정)
 *   가입 완료 · 세션 없음 → 러닝 시작 화면
 *
 * **가입 중 재개 지점은 동의 행의 존재 여부로 정한다**(D5). 화면이 어디까지 갔는지를
 * client 에 기억시키지 않기 때문에, 앱을 닫았다 다른 기기에서 다시 로그인해도 같은 곳으로 온다.
 *
 * 진행 중 러닝 갈래도 같은 성질이다(#81) — 서버가 판단하므로 어느 기기로 들어와도 러닝으로
 * 돌아온다. 그 기기가 측정할 수 있는지(D14)는 러닝 화면이 따로 가른다.
 */
export default async function Home() {
  const viewer = await getViewer();

  if (!viewer) redirect("/login");

  if (viewer.accountState === "signing_up") {
    redirect(
      (await hasCurrentConsent(viewer.userId))
        ? "/signup/nickname"
        : "/signup/consent",
    );
  }

  if (viewer.hasActiveRun) redirect("/running");

  redirect("/home");
}
