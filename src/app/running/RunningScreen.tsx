"use client";

import Link from "next/link";
import { useState } from "react";

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
    이 기기는 더 이상 writer 가 아니다(#148 · D14). 다른 기기가 **인수**(409
    `tracker_superseded`)했거나 **종료**(403 `not_tracker`)했고, 훅은 그 응답을 받은 순간
    watch 를 멈춘다. 그런데 화면은 러닝 중 그대로여서, 사용자는 다시 열어 보기 전까지
    측정이 멈춘 것을 모른다.

    **둘 중 무엇인지는 화면이 모른다** — 훅이 내려 주는 것은 `read-only` 하나이고,
    마운트 시점에 writer 가 아니었던 기기도 같은 값을 받는다. 사용자가 할 일도 둘이
    같아서(이 기기에서는 더 못 잰다) 한 문구로 알리고, 갈라지는 지점은 `/` 가
    서버 판정으로 처리한다 — 아래 안내의 링크를 본다.
  */
  const trackerStopped = tracker.status === "read-only";

  /*
    지도의 딤 · 경고 카드는 **신호를 잃었다는 것이 사용자에게 뜻이 있을 때만** 띄운다.
    화면을 숨겨서 생긴 gap(D1)은 사용자가 알고 한 일이라 경고하지 않는다 —
    그 구분은 훅이 `gpsWarning` 으로 내려 준다(P3 2초 기준 포함).

    권한이 꺼진 경우는 2초를 기다리지 않는다. 측정이 확실히 멈춘 상태라 「GPS 정상」을
    보여 주면 거짓말이 된다.

    측정이 아예 끝난 뒤에는 GPS 경고를 켜지 않는다 — 「신호가 복구될 때까지」는 복구되면
    다시 잰다는 뜻인데, 이 기기는 신호가 돌아와도 재지 않는다(#148).
  */
  const gpsLost =
    !trackerStopped &&
    (tracker.gpsWarning || tracker.status === "permission-denied");

  /*
    서버가 끝내 받지 않은 점이 하나라도 생겼다(#151). 훅의 `conflict` 를 **조건에 그대로
    걸지 않고 여기서 래치한다** — 그 값은 다음 flush 가 성공하거나 버퍼가 비는 순간 `idle`
    로 돌아가서(`useRunTracker.flush`), 직접 걸면 배너가 수백 ms 깜빡이고 사라진다.

    버려진 점은 돌아오지 않으므로 사실 자체는 이 러닝이 끝날 때까지 유효하다. 래치는 화면
    안에서만 하고 훅의 업로드 · 버퍼 로직은 건드리지 않는다.

    effect 가 아니라 **렌더 중에 조정한다** — 훅 바깥의 무엇과도 동기화하지 않고 이미 받은
    값에서 바로 나오는 상태라 effect 를 두면 렌더가 한 번 더 도는 것 말고 얻는 것이 없다
    (React 「You Might Not Need an Effect」). 한 번 true 면 조건이 다시 서지 않아 멈춘다.
  */
  const [pointsDropped, setPointsDropped] = useState(false);
  if (tracker.uploadStatus === "conflict" && !pointsDropped) {
    setPointsDropped(true);
  }

  return (
    <>
      <RunStatusBar
        startedAt={startedAt}
        gpsLost={gpsLost}
        inZone={tracker.inZone}
        stopped={trackerStopped}
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
        fix 가 **시각 때문에** 걸러지고 있다(#160 · #145). 신호가 없어서 비는 것과 화면상
        구분이 없으면 사용자는 하늘이 트인 곳을 찾아 나서는 등 엉뚱한 행동을 하게 된다 —
        원인은 기기 설정이고, 고치면 그 자리에서 다시 기록된다(러닝을 다시 시작하지 않아도
        된다). 훅이 「GPS 신호 약함」과 **동시에 켜지지 않게** 내려 준다.

        60초 · 허용치 · rawSeq 같은 내부 용어는 쓰지 않는다(#125).
      */}
      {tracker.clockSkew ? (
        <p
          role="alert"
          className="mx-4 mt-3 shrink-0 rounded-md border-[1.5px] border-error-border bg-error-soft px-4 py-3 text-sm font-bold text-error"
        >
          기기 시간이 실제 시각과 달라 기록되지 않고 있어요. 기기 설정에서 날짜 · 시간을
          자동으로 맞추면 다시 기록됩니다.
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

      {/*
        offline 과 rate-limited 는 원인이 다르다(#125) — 하나로 뭉치면 사용자가 잘못된
        행동(자리 이동 · 비행기 모드 토글 등)을 하게 된다. rate-limited 는 서버가 자원
        보호로 잠시 늦춘 것뿐이라 "곧 자동으로 다시 보낸다"는 것을 알려 준다 — 429 ·
        토큰버킷 같은 내부 용어는 쓰지 않는다(`useRunTracker.ts` 가 이미 아는 값이고
        여기서 새로 계산하지 않는다).
      */}
      {tracker.uploadStatus === "offline" ? (
        <p
          role="status"
          className="mx-4 mt-3 shrink-0 rounded-md bg-surface-muted px-4 py-2.5 text-note font-bold text-subtle"
        >
          연결이 원활하지 않아 기록 전송이 미뤄지고 있어요. 측정은 계속되고 기록도 그대로
          보존됩니다.
        </p>
      ) : null}

      {tracker.uploadStatus === "rate-limited" ? (
        <p
          role="status"
          className="mx-4 mt-3 shrink-0 rounded-md bg-surface-muted px-4 py-2.5 text-note font-bold text-subtle"
        >
          지금은 전송 속도를 잠시 늦추고 있어요. 측정은 계속되고 기록도 보존되며, 잠시 후
          자동으로 다시 보냅니다.
        </p>
      ) : null}

      {/*
        위 둘과 달리 **되돌아오지 않는다.** offline · rate-limited 는 「보존된다 · 곧 다시
        보낸다」지만 여기는 그 점이 기록에서 빠진 채로 끝난다 — 같은 회색 안내로 두면 기다리면
        해결되는 것으로 읽힌다. 그래서 warning 토큰으로 구분한다.

        **원인을 문구에 박지 않는다.** 같은 번호에 다른 좌표가 이미 있었든(`point_conflict`)
        서버가 받지 않는 시각이었든(`invalid_recorded_at` · #145) 사용자에게는 「저장되지 않은
        구간이 생겼다」 하나이고, 할 수 있는 일도 없다. 원인이 늘 때마다 문구를 늘리지 않는다.
        rawSeq · 409 같은 내부 용어도 쓰지 않는다(#125).
      */}
      {pointsDropped ? (
        <p
          role="status"
          className="mx-4 mt-3 shrink-0 rounded-md border-[1.5px] border-warning-border bg-warning-soft px-4 py-2.5 text-note font-bold text-warning"
        >
          일부 구간이 기록에 저장되지 않았어요. 측정과 나머지 기록은 그대로 이어집니다.
        </p>
      ) : null}

      <RunStats
        totalDistanceKm={toKilometres(tracker.totalDistanceM)}
        tancheonDistanceKm={toKilometres(tracker.tancheonDistanceM)}
        paceSecPerKm={tracker.currentPaceSecPerKm}
        // 신호를 잃은 동안에는 구역 안이어도 강조하지 않는다(원본 L1313).
        tancheonHighlighted={tracker.inZone && !gpsLost}
      />

      {/*
        측정이 끝난 기기에는 **종료 슬라이드를 두지 않는다**(#148). 끝까지 밀어도 훅이
        writer record 가 없어 종료 의사를 남기지 못하고(`useRunTracker.finish`), 그런데도
        결과 화면으로 넘어가 러닝을 끝낸 것처럼 보인다.

        대신 다음 행동을 `/` 로 보낸다 — 러닝이 이미 끝났으면 `/home`, 아직 진행 중이면
        `/running` 으로 되돌아와 `TrackerGate` 가 「이어서 측정」·「여기서 종료」를 준다.
        어느 쪽인지 서버만 아는 것을 화면이 추측하지 않는다.
      */}
      {trackerStopped ? (
        <div className="shrink-0 px-4 pt-2 pb-[22px]">
          <div
            role="alert"
            className="rounded-2xl border-[1.5px] border-border bg-surface px-5 py-5 shadow-card"
          >
            <p className="text-content font-extrabold text-foreground">
              이 기기에서는 더 이상 측정하지 않아요
            </p>
            <p className="mt-2 text-note leading-[1.6] font-medium text-subtle">
              다른 기기가 이 러닝을 이어받았거나 이미 종료했어요. 지금까지 서버에
              보낸 기록은 그대로 남아 있어요.
            </p>
            <Link
              href="/"
              className="mt-4 flex h-[58px] items-center justify-center rounded-xl bg-primary text-button font-extrabold text-on-primary shadow-primary"
            >
              현재 상태 확인
            </Link>
          </div>
        </div>
      ) : (
        <SlideToFinish sessionId={sessionId} onFinish={tracker.finish} />
      )}
    </>
  );
}
