import { redirect } from "next/navigation";

import { AppShell } from "@/components/shared/AppShell";
import { getViewer } from "@/server/auth/session";
import { getActiveRun } from "@/server/runs/actions";

import { TrackerGate } from "./TrackerGate";
import { RunMap } from "./RunMap";
import { RunStats } from "./RunStats";
import { RunStatusBar } from "./RunStatusBar";
import { SlideToFinish } from "./SlideToFinish";
import { getSnapshot, resolvePaceSecPerKm, type RunningVariant } from "./mock";

/**
 * 러닝 진행 화면(F2 · F3 · F4) — 디자인 `탄천런.dc.html` L207-296.
 *
 * 서버도 GPS 측정도 없어서 네 도메인 상태를 실제로 만들 수 없다. `/login?error=cancelled`
 * 가 이미 쓰는 방식 그대로 URL 쿼리로 상태를 고른다 — 리뷰어가 코드를 고치지 않고 눈으로
 * 확인할 수 있고, 나중에 측정이 붙으면 이 자리가 측정 결과로 바뀐다. 디자인 캔버스에 있는
 * "GPS 신호 끊기 · 복구 시뮬레이션" 버튼(L258 · L286)을 제품 화면에 넣지 않는 이유이기도 하다.
 *
 * 요청 기반 loading · error 는 이 화면에 없다 — 실패할 요청이 없는 상태에서 가짜 Promise 나
 * query error 를 만들지 않는다(이슈 #40 결정 이력 · `docs/SCREEN_ASSIGNMENTS.md:109`).
 *
 * 모르는 값은 정상(구역 내)으로 묶어 원인 코드를 화면에 그대로 보이지 않는다.
 */
function resolveVariant(raw: string | string[] | undefined): RunningVariant {
  const value = Array.isArray(raw) ? raw[0] : raw;

  return value === "out-zone" || value === "gps-lost" || value === "start"
    ? value
    : "in-zone";
}

export default async function RunningPage({
  searchParams,
}: PageProps<"/running">) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  /*
    D8 — 서버가 viewer 의 active run 을 직접 조회한다. URL 에 sessionId 가 없으므로
    남의 세션 id 를 넣어 볼 표면 자체가 없다. 진행 중인 러닝이 없으면 홈으로 보낸다.
  */
  const active = await getActiveRun();
  if (!active) redirect("/home");

  const { state } = await searchParams;
  const snapshot = getSnapshot(resolveVariant(state));

  return (
    // Header 없음 — 상단이 공용 sticky 헤더가 아니라 전용 구조다(이슈 결정 이력).
    // bottom 없음 — 탭바가 없는 화면이고, 나가는 길은 종료 슬라이드뿐이다.
    // padded={false} — 블록마다 가로 여백이 20px · 16px 로 달라 각자 준다.
    <AppShell padded={false}>
      <TrackerGate
        userId={viewer.userId}
        sessionId={active.sessionId}
        trackerGeneration={active.trackerGeneration}
      />

      {/* 경과 시간은 서버 `started_at` 에서 센다 — client 시계나 mock 값이 아니다. */}
      <RunStatusBar
        startedAt={active.startedAt}
        gpsLost={snapshot.gpsLost}
        inZone={snapshot.inZone}
      />

      <RunMap
        route={snapshot.route}
        userPin={snapshot.userPin}
        gpsLost={snapshot.gpsLost}
      />

      <RunStats
        totalDistanceKm={snapshot.totalDistanceKm}
        tancheonDistanceKm={snapshot.tancheonDistanceKm}
        paceSecPerKm={resolvePaceSecPerKm(snapshot)}
        // 신호를 잃은 동안에는 구역 안이어도 강조하지 않는다(원본 L1313).
        tancheonHighlighted={snapshot.inZone && !snapshot.gpsLost}
      />

      <SlideToFinish />
    </AppShell>
  );
}
