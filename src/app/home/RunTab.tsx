"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { requestPersistentStorage, saveTrackerRecord } from "@/client/tracker";
import { AppShell } from "@/components/shared/AppShell";
import { BottomNav } from "@/components/shared/BottomNav";
import { startRun } from "@/server/runs/actions";

import { Countdown } from "./Countdown";
import { HomeHeader } from "./HomeHeader";
import { MOCK_NICKNAME, RUNNING_ROUTE } from "./mock";
import { MyRankCard } from "./MyRankCard";
import { RunMapCard } from "./RunMapCard";
import { useGeolocationReady } from "./useGeolocationReady";

/** 카운트다운 숫자와 간격(디자인 L1074-1086). `0` 은 "GO!" 를 띄우는 자리다. */
const COUNTDOWN_START = 3;
const TICK_MS = 1000;
/** "GO!" 를 이만큼 보여 준 뒤 러닝 진행 화면으로 넘어간다(디자인 L1081). */
const GO_HOLD_MS = 900;

/** `startRun` 실패 사유별 문구. 원인 코드를 그대로 보이지 않는다. */
const START_ERROR_MESSAGES = {
  active_exists: "이미 진행 중인 러닝이 있습니다.",
  not_ready: "GPS 신호를 확인할 수 없어 러닝을 시작할 수 없습니다.",
  failed: "러닝을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.",
} as const;

type RunTabProps = {
  /** 서버가 확인한 진행 중 러닝 여부. 있으면 새로 시작할 수 없다(P7). */
  hasActiveRun: boolean;
};

/**
 * 홈 — 달리기 탭(디자인 L684-771).
 *
 * 화면 전체가 클라이언트인 이유는 **카운트다운이 탭바의 유무까지 바꾸기** 때문이다.
 * 정본에서 카운트다운은 홈과 형제인 별도 화면 상태라 `<nav>` 바깥에 있다(L199 · L921).
 * `AppShell` 의 `bottom` 슬롯을 비우려면 조립 자체가 상태를 알아야 해서, 여기서
 * 껍데기까지 함께 조립한다.
 *
 * GPS 준비 여부는 이제 **실제 권한 · 측위**다(#81). `?gps=` 쿼리 계약은 없앴다.
 */
export function RunTab({ hasActiveRun }: RunTabProps) {
  const router = useRouter();

  const { state: gpsState, firstFix, retry: retryGps } = useGeolocationReady();

  /** `null` 이면 카운트다운 중이 아니다. 홈과 카운트다운을 가르는 값이기도 하다. */
  const [countdown, setCountdown] = useState<number | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  /**
   * 카운트다운이 끝나는 순간의 처리. 순서가 중요하다(D11 · D14).
   *
   * 1. 서버에 세션을 만든다 — 여기서 실패하면 러닝은 시작되지 않은 것이다.
   * 2. **tracker 를 IndexedDB 에 저장한 뒤에** 이동한다. 저장 전에 화면을 옮기고 그 사이에
   *    탭이 죽으면 서버에는 active 세션이 있는데 어느 기기도 token 을 갖지 못한다.
   * 3. 그다음 러닝 화면으로 간다.
   *
   * 실패하면 카운트다운을 되돌려 홈으로 돌아온다 — 세션이 없는데 러닝 화면에 있으면 안 된다.
   */
  const beginRun = useCallback(async () => {
    const result = await startRun({ firstFix });

    if ("error" in result) {
      setStartError(START_ERROR_MESSAGES[result.error]);
      setCountdown(null);
      if (result.error === "not_ready") retryGps();
      return;
    }

    // 저장소가 비워지지 않도록 부탁해 둔다. 실패해도 러닝을 막지 않는다(D11).
    await requestPersistentStorage();

    try {
      await saveTrackerRecord({
        userId: result.userId,
        sessionId: result.sessionId,
        trackerToken: result.trackerToken,
        trackerGeneration: result.trackerGeneration,
      });
    } catch {
      /*
        서버에는 세션이 생겼는데 이 기기가 tracker 를 갖지 못했다. 러닝 자체는 살아 있으므로
        진행 화면으로 보내되, 그 화면이 read-only 로 뜨고 「이 기기에서 이어서 측정」으로
        인수할 수 있다. 세션을 지우지 않는다 — 지우면 이미 만들어진 러닝이 사라진다.
      */
    }

    router.push(RUNNING_ROUTE);
  }, [firstFix, retryGps, router]);

  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      const toRunning = setTimeout(() => void beginRun(), GO_HOLD_MS);
      return () => clearTimeout(toRunning);
    }

    const tick = setTimeout(
      () => setCountdown((left) => (left === null ? null : left - 1)),
      TICK_MS,
    );
    return () => clearTimeout(tick);
  }, [countdown, beginRun]);

  if (countdown !== null) {
    // 탭바 없이 화면 전체를 채운다(디자인 L199-206).
    return (
      <AppShell padded={false}>
        <Countdown count={countdown} />
      </AppShell>
    );
  }

  function handleStart() {
    setStartError(null);

    // 서버가 이미 진행 중인 러닝을 알고 있으면 카운트다운조차 시작하지 않는다.
    if (hasActiveRun) {
      setStartError(START_ERROR_MESSAGES.active_exists);
      return;
    }

    setCountdown(COUNTDOWN_START);
  }

  return (
    <AppShell
      header={<HomeHeader gps={gpsState} />}
      bottom={<BottomNav />}
      // 좌우 여백이 헤더 20px · 본문 16px 로 달라서 공통 여백을 끄고 직접 준다.
      padded={false}
    >
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
        <div className="shrink-0 px-1 pb-3">
          <h1 className="text-[22px] leading-[1.3] font-extrabold tracking-[-0.5px]">
            안녕하세요, {MOCK_NICKNAME}님
          </h1>
          <p className="mt-[3px] text-sm font-medium text-muted">
            오늘도 탄천에서 달려볼까요?
          </p>
        </div>

        <RunMapCard
          gps={gpsState}
          startError={startError}
          position={firstFix}
          onStart={handleStart}
        />

        <MyRankCard />
      </div>
    </AppShell>
  );
}
