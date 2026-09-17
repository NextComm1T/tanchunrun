"use client";

import { useEffect, useState } from "react";

import { formatElapsed } from "./format";

/**
 * 러닝 진행 화면 상단 — 대형 러닝 시간 + GPS · 구역 배지(디자인 L209-227).
 *
 * 공용 `Header` 를 쓰지 않는다. 정본 상단이 sticky 헤더가 아니라 달리면서 읽는
 * 전용 구조이기 때문이다(이슈 #40 결정 이력 2026-09-14).
 *
 * **순위는 여기에도 어디에도 나오지 않는다** — 러닝 중에는 보여 주지 않는다 · R6.
 *
 * 경과 시간은 **서버 `started_at` 에서 센다**(#81). client 가 따로 세면 reload · 재진입마다
 * 0 부터 다시 시작하고, 탭이 백그라운드로 내려간 동안 멈춘다. 서버 시각을 기준으로 두면
 * 어느 기기에서 언제 들어와도 같은 값이 나온다.
 */

type RunStatusBarProps = {
  /** 서버가 기록한 시작 시각(ISO). */
  startedAt: string;
  gpsLost: boolean;
  inZone: boolean;
};

const TICK_MS = 1000;

function elapsedSecondsSince(startedAt: string, now: number): number {
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) return 0;

  // 기기 시계가 서버보다 뒤처져 있으면 음수가 나올 수 있다. 0 아래로 내려가지 않게 막는다.
  return Math.max(0, Math.floor((now - started) / 1000));
}

/** 배지 하나. 점 색만 다르고 모양은 전부 같다(디자인 L214-225). */
function StatusBadge({
  dotClassName,
  className,
  pulse = false,
  children,
}: {
  dotClassName: string;
  className: string;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-label font-bold ${className}`}
    >
      <span
        className={`size-[7px] rounded-full ${dotClassName} ${pulse ? "animate-pulse" : ""}`}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

export function RunStatusBar({
  startedAt,
  gpsLost,
  inZone,
}: RunStatusBarProps) {
  /*
    상태로 두는 것은 **현재 시각 하나**고 경과 시간은 거기서 파생시킨다. 경과 시간을 상태로
    들고 있으면 `startedAt` 이 바뀔 때 effect 에서 다시 setState 해야 하는데, 그건 렌더를
    연쇄시킨다(react-hooks/set-state-in-effect). 파생값으로 두면 그럴 일이 없다.
  */
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const elapsedSec = elapsedSecondsSince(startedAt, now);

  return (
    <div className="flex shrink-0 items-start justify-between px-5 pt-1 pb-3">
      <p
        /*
          서버가 그린 시각과 hydration 시각이 1초쯤 다를 수 있다. 흐르는 시계라 당연한
          차이고 곧바로 client 값으로 덮인다 — 경고만 끄고 값은 그대로 둔다.
        */
        suppressHydrationWarning
        className="text-[64px] leading-none font-extrabold tracking-[-2px] text-foreground"
      >
        {formatElapsed(elapsedSec)}
      </p>

      <div className="mt-2 flex flex-col items-end gap-1.5">
        {gpsLost ? (
          // 신호를 잃은 동안에는 구역 배지를 숨긴다 — 구역 판정이 성립하지 않는다.
          <StatusBadge
            dotClassName="bg-warning-dot"
            className="bg-warning-soft text-warning"
          >
            GPS 신호 약함
          </StatusBadge>
        ) : (
          <>
            <StatusBadge
              dotClassName="bg-success-dot"
              className="bg-success-soft text-success"
              pulse
            >
              GPS 정상
            </StatusBadge>
            {inZone ? (
              <StatusBadge
                dotClassName="bg-primary"
                className="bg-primary-soft text-primary-strong"
              >
                구역 내
              </StatusBadge>
            ) : (
              <StatusBadge
                dotClassName="bg-disabled"
                className="bg-surface-muted text-muted"
              >
                구역 밖
              </StatusBadge>
            )}
          </>
        )}
      </div>
    </div>
  );
}
