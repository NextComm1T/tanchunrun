import { redirect } from "next/navigation";

import { AppShell } from "@/components/shared/AppShell";
import type { RawPoint } from "@/domain/measure";
import { getViewer } from "@/server/auth/session";
import { getActiveRun } from "@/server/runs/actions";

import { RunningScreen } from "./RunningScreen";
import { TrackerGate } from "./TrackerGate";

/**
 * 러닝 진행 화면(F2 · F3 · F4) — 디자인 `탄천런.dc.html` L207-296.
 *
 * 서버가 하는 일은 **누구의 어떤 러닝인지 정하는 것**까지다. 실제 측정 · 업로드는 기기에서만
 * 할 수 있어서 `RunningScreen` 이 이어받는다.
 *
 * `?state=` 쿼리로 상태를 고르던 계약은 사라졌다(#83). 이제 화면이 보여 주는 것은 전부
 * 실제 측정 결과이고, 도메인 상태도 측정에서 나온다.
 */
export default async function RunningPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  /*
    D8 — 서버가 viewer 의 active run 을 직접 조회한다. URL 에 sessionId 가 없으므로
    남의 세션 id 를 넣어 볼 표면 자체가 없다. 진행 중인 러닝이 없으면 홈으로 보낸다.
  */
  const active = await getActiveRun();
  if (!active) redirect("/home");

  /*
    서버가 이미 받은 측정점만 넘긴다. 아직 보내지 못한 점은 기기의 IndexedDB 에 있고
    화면이 둘을 합쳐 복원한다 — 거리 · 페이스 같은 파생값은 서버가 만들지 않는다.
  */
  const serverPoints: RawPoint[] = active.points
    .filter((point) => point.kind === "measured")
    .map((point) => ({
      trackerGeneration: point.trackerGeneration,
      rawSeq: point.rawSeq,
      segment: point.segment,
      lat: point.lat,
      lng: point.lng,
      recordedAt: point.recordedAt,
      accuracy: point.accuracy ?? undefined,
    }));

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

      <RunningScreen
        userId={viewer.userId}
        sessionId={active.sessionId}
        startedAt={active.startedAt}
        trackerGeneration={active.trackerGeneration}
        serverPoints={serverPoints}
      />
    </AppShell>
  );
}
