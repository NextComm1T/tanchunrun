import { redirect } from "next/navigation";

import { hasCurrentConsent } from "@/server/account/consent";
import { getViewer } from "@/server/auth/session";

/**
 * 앱 진입점 — 인증 상태에 따른 분기(#80 · `docs/07-screens.md:35-38`).
 *
 *   로그아웃              → 로그인 화면
 *   가입 중 · 동의 전     → 동의 화면
 *   가입 중 · 동의 후     → 닉네임 설정 화면
 *   가입 완료             → 러닝 시작 화면
 *
 * 「진행 중 세션 있음 → 러닝 진행 화면」 갈래는 #81 이 이 위에 얹는다. 지금은 세션 자체가
 * 없어서 만들 수 없는 갈래다 — 가짜로 흉내내지 않는다.
 *
 * **가입 중 재개 지점은 동의 행의 존재 여부로 정한다**(D5). 화면이 어디까지 갔는지를
 * client 에 기억시키지 않기 때문에, 앱을 닫았다 다른 기기에서 다시 로그인해도 같은 곳으로 온다.
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

  redirect("/home");
}
