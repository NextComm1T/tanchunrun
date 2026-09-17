"use client";

import Link from "next/link";

import type { RawPoint } from "@/domain/measure";

import { RunMap } from "./RunMap";
import { RunStats } from "./RunStats";
import { RunStatusBar } from "./RunStatusBar";
import { SlideToFinish } from "./SlideToFinish";
import { toKilometres } from "./format";
import { useRunTracker } from "./useRunTracker";

/**
 * 러닝 진행 화면의 client 껍데기(#83).
 *
 * 측정 · 버퍼 · 업로드는 `useRunTracker` 가 하고, 여기서는 그 결과를 디자인에 얹기만 한다.
 * 수치를 여기서 다시 계산하지 않는다 — 계산은 `src/domain/measure`(#82) 한 곳이다.
 */

type RunningScreenProps = {
  userId: string;
  sessionId: string;
  startedAt: string;
  trackerGeneration: number;
  serverPoints: RawPoint[];
};

export function RunningScreen({
  userId,
  sessionId,
  startedAt,
  trackerGeneration,
  serverPoints,
}: RunningScreenProps) {
  const tracker = useRunTracker({
    userId,
    sessionId,
    trackerGeneration,
    startedAt,
    serverPoints,
  });

  /*
    지도의 딤 · 경고 카드는 **신호를 잃었다는 것이 사용자에게 뜻이 있을 때만** 띄운다.
    화면을 숨겨서 생긴 gap(D1)은 사용자가 알고 한 일이라 경고하지 않는다 —
    그 구분은 훅이 `gpsWarning` 으로 내려 준다(P3 2초 기준 포함).

    권한이 꺼진 경우는 2초를 기다리지 않는다. 측정이 확실히 멈춘 상태라 「GPS 정상」을
    보여 주면 거짓말이 된다.
  */
  const gpsLost = tracker.gpsWarning || tracker.status === "permission-denied";

  return (
    <>
      <RunStatusBar
        startedAt={startedAt}
        gpsLost={gpsLost}
        inZone={tracker.inZone}
      />

      <RunMap
        route={tracker.routePoints}
        marker={tracker.marker}
        gpsLost={gpsLost}
      />

      {/*
        종료를 이미 눌렀는데 저장이 끝나지 않은 채 다시 들어온 경우다(P14). 측정을 다시
        시작하지 않는다 — 끝난 러닝에 점을 더 붙이면 안 된다. **결과 복구 화면은 #85 가
        만든다.** 그때까지는 무슨 일이 일어나고 있는지만 알린다.
      */}
      {tracker.status === "finish-pending" ? (
        <p
          role="status"
          className="mx-4 mt-3 shrink-0 rounded-md bg-surface-muted px-4 py-3 text-note font-bold text-subtle"
        >
          종료 처리 중인 러닝이에요. 측정은 다시 시작하지 않습니다.
        </p>
      ) : null}

      {tracker.status === "permission-denied" ? (
        <p
          role="alert"
          className="mx-4 mt-3 shrink-0 rounded-md border-[1.5px] border-error-border bg-error-soft px-4 py-3 text-sm font-bold text-error"
        >
          위치 권한이 꺼져 측정이 멈췄어요.{" "}
          <Link href="/settings/location" className="underline">
            위치정보 설정 보기
          </Link>
        </p>
      ) : null}

      {/*
        업로드 실패는 **러닝을 막지 않는다**(P14). 측정은 계속되고 기록도 기기에 남아 있다.
        인증 만료도 오프라인과 같은 재시도 가능한 실패라 다시 로그인할 길만 보여 준다(D11).
      */}
      {tracker.uploadStatus === "auth-expired" ? (
        <p
          role="status"
          className="mx-4 mt-3 shrink-0 rounded-md border-[1.5px] border-error-border bg-error-soft px-4 py-3 text-sm font-bold text-error"
        >
          로그인이 만료돼 기록을 서버에 보내지 못하고 있어요. 측정은 계속됩니다.{" "}
          <Link href="/login" className="underline">
            다시 로그인
          </Link>
        </p>
      ) : null}

      {tracker.uploadStatus === "offline" ||
      tracker.uploadStatus === "rate-limited" ? (
        <p
          role="status"
          className="mx-4 mt-3 shrink-0 rounded-md bg-surface-muted px-4 py-2.5 text-note font-bold text-subtle"
        >
          연결이 불안정해 기록 전송을 미루고 있어요. 측정은 계속됩니다.
        </p>
      ) : null}

      <RunStats
        totalDistanceKm={toKilometres(tracker.totalDistanceM)}
        tancheonDistanceKm={toKilometres(tracker.tancheonDistanceM)}
        paceSecPerKm={tracker.currentPaceSecPerKm}
        // 신호를 잃은 동안에는 구역 안이어도 강조하지 않는다(원본 L1313).
        tancheonHighlighted={tracker.inZone && !gpsLost}
      />

      <SlideToFinish sessionId={sessionId} onFinish={tracker.finish} />
    </>
  );
}
