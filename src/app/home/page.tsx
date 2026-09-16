import { redirect } from "next/navigation";

import { getViewer } from "@/server/auth/session";
import { getHomeSummary } from "@/server/rankingView";

import { RunTab } from "./RunTab";

/**
 * 홈 — 달리기 탭(#42 · #81 · #87).
 *
 * GPS 준비 여부는 이제 **client 가 실제 권한 · 측위로 판정한다**(`useGeolocationReady`).
 * `?gps=ready` 쿼리 계약은 없앴다 — 측정이 실제로 붙었으므로 흉내낼 이유가 사라졌다.
 *
 * 서버가 아는 것은 두 가지다 — 「진행 중인 러닝이 있는가」(P7)와 인사 · 「내 탄천 순위」에
 * 들어갈 요약(#87)이다. 요약은 `/ranking` 과 **같은 조회**를 지나므로 두 화면의 순위 · 누적이
 * 어긋날 수 없다.
 */
export default async function HomePage() {
  const viewer = await getViewer();

  if (!viewer) redirect("/login");

  /*
    닉네임이 없으면 가입이 아직 끝나지 않은 사용자다(`account_state = 'signing_up'`).
    어느 단계로 보낼지는 `/` 가 동의 행을 보고 정하므로(#80 · D5) 여기서 판단하지 않고 넘긴다.
    러닝을 시작할 수도 없는 상태라(`runs/actions.ts:61`) 홈을 그릴 이유가 없다.
  */
  if (viewer.nickname === null) redirect("/");

  const summary = await getHomeSummary({
    userId: viewer.userId,
    nickname: viewer.nickname,
  });

  return <RunTab hasActiveRun={viewer.hasActiveRun} summary={summary} />;
}
