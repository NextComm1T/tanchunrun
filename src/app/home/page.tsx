import { redirect } from "next/navigation";

import { getViewer } from "@/server/auth/session";

import { RunTab } from "./RunTab";

/**
 * 홈 — 달리기 탭(#42 · #81).
 *
 * GPS 준비 여부는 이제 **client 가 실제 권한 · 측위로 판정한다**(`useGeolocationReady`).
 * `?gps=ready` 쿼리 계약은 없앴다 — 측정이 실제로 붙었으므로 흉내낼 이유가 사라졌다.
 *
 * 서버가 아는 것은 「진행 중인 러닝이 있는가」 하나다(P7). 있으면 새로 시작할 수 없다.
 */
export default async function HomePage() {
  const viewer = await getViewer();

  if (!viewer) redirect("/login");

  return <RunTab hasActiveRun={viewer.hasActiveRun} />;
}
