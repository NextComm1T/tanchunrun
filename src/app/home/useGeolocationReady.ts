"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { FirstFix } from "@/server/runs/actions";

/**
 * 위치 권한과 첫 측위(#81 · P1).
 *
 * **두 조건이 모두 참일 때만 러닝을 시작할 수 있다** — ① 권한이 허용됐고 ② 현재 위치를
 * 한 번 이상 확보했다. 권한만으로는 부족하다. 실내나 신호가 약한 곳에서는 권한이 있어도
 * 좌표가 오지 않는데, 그 상태로 시작하면 출발점이 없는 러닝이 된다.
 *
 * 예전에는 `?gps=ready` 쿼리로 이 상태를 흉내냈다. 실제 측위가 붙었으므로 쿼리 계약은 없앤다.
 */

export type GeolocationReadyState =
  /** 권한 · 측위를 확인하는 중. 시작 버튼은 막혀 있다. */
  | "checking"
  /** 사용자가 권한을 거부했다. 브라우저 설정에서 풀어야 한다. */
  | "denied"
  /** 권한은 있는데 좌표를 못 받았다. */
  | "unavailable"
  /** 시작할 수 있다. */
  | "ready";

export type GeolocationReady = {
  state: GeolocationReadyState;
  /** 시작할 때 서버로 보낼 첫 측위. `ready` 일 때만 값이 있다. */
  firstFix: FirstFix | null;
  /** 실패한 뒤 다시 시도한다. */
  retry: () => void;
};

/** 첫 측위를 기다리는 한도. 넘으면 `unavailable` 로 보고 안내를 띄운다. */
const FIX_TIMEOUT_MS = 10_000;

/**
 * Permissions API 로 권한 상태를 미리 본다.
 *
 * 거부 상태에서 `getCurrentPosition` 을 부르면 브라우저에 따라 조용히 실패하거나 한참 뒤에
 * 오류가 온다. 미리 알면 바로 안내할 수 있다. Safari 처럼 지원하지 않는 브라우저도 있어서
 * **없으면 `null` 을 돌려주고 그냥 측위를 시도**한다.
 */
async function resolvePermission(): Promise<PermissionState | null> {
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" });
    return status?.state ?? null;
  } catch {
    return null;
  }
}

function getCurrentFix(): Promise<
  { ok: true; fix: FirstFix } | { ok: false; denied: boolean }
> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          ok: true,
          fix: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            recordedAt: position.timestamp,
          },
        }),
      // 좌표 · 오류 내용을 로그에 남기지 않는다.
      (error) =>
        resolve({ ok: false, denied: error.code === error.PERMISSION_DENIED }),
      {
        enableHighAccuracy: true,
        timeout: FIX_TIMEOUT_MS,
        // 시작 판정은 **지금** 위치여야 한다. 캐시된 좌표를 받지 않는다.
        maximumAge: 0,
      },
    );
  });
}

export function useGeolocationReady(): GeolocationReady {
  const [state, setState] = useState<GeolocationReadyState>("checking");
  const [firstFix, setFirstFix] = useState<FirstFix | null>(null);
  const [attempt, setAttempt] = useState(0);

  /*
    권한 변경 핸들러가 "지금 막혀 있는가"를 읽어야 한다. 핸들러는 구독할 때의 렌더에 묶여
    있어서 `state` 를 그대로 읽으면 옛 값을 본다. 렌더에는 쓰지 않는 거울 값이다.
  */
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;

    /*
      확인 전체를 하나의 비동기 흐름으로 둔다. effect 본문에서 곧바로 setState 하면
      렌더가 연쇄되므로(react-hooks/set-state-in-effect), 상태 변경은 전부 await 뒤에서
      일어난다. `checking` 으로 되돌리는 것은 effect 가 아니라 `retry()` 가 한다.
    */
    async function detect() {
      if (!("geolocation" in navigator)) {
        if (!cancelled) setState("unavailable");
        return;
      }

      const permission = await resolvePermission();
      if (cancelled) return;

      if (permission === "denied") {
        setFirstFix(null);
        setState("denied");
        return;
      }

      const result = await getCurrentFix();
      if (cancelled) return;

      if (!result.ok) {
        setFirstFix(null);
        setState(result.denied ? "denied" : "unavailable");
        return;
      }

      setFirstFix(result.fix);
      setState("ready");
    }

    void detect();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState("checking");
    setFirstFix(null);
    setAttempt((n) => n + 1);
  }, []);

  /*
    권한은 이 화면 밖에서 바뀐다 — 브라우저 · OS 설정, 그리고 설정 > 위치정보 화면(#124).
    위 effect 는 마운트와 `retry()` 때만 도므로, 그것만으로는 거부를 풀고 돌아와도 새로고침
    전까지 막힌 채로 남고 반대로 권한을 끈 뒤에도 시작 가능으로 보인다(#152).

    `status.onchange` 를 구독하고, 그 구독이 조용히 걸리지 않는 경우(탭이 오래 백그라운드에
    있었거나 OS 수준 설정을 거친 경우)를 대비해 탭이 다시 보이거나 창이 focus 를 되찾을 때
    한 번 더 조회한다 — 설정 화면의 `useLocationPermission` 과 같은 방식이다.

    Permissions API 가 없는 브라우저(Safari 일부)는 `status` 가 없어 그대로 넘어가므로
    지금 동작 그대로다.
  */
  useEffect(() => {
    let cancelled = false;
    /** `onchange` 를 붙인 status. 정리할 때 떼려고 들고 있는다. */
    let watched: PermissionStatus | undefined;

    function apply(permission: PermissionState) {
      if (cancelled) return;

      if (permission === "denied") {
        // 이미 확보한 좌표로는 시작할 수 없다. 버리지 않으면 시작 버튼이 살아 있다.
        setFirstFix(null);
        setState("denied");
        return;
      }

      /*
        허용(`granted`)이나 미결정(`prompt`)으로 풀렸을 때 **막혀 있던 화면만** 첫 측위를
        다시 시작한다. `unavailable` 은 권한이 아니라 신호 문제라 「다시 확인」(#119) 몫이고,
        `ready` · `checking` 에서 다시 재면 끝났거나 도는 중인 측위를 헛돌린다 — 마운트 때
        프롬프트를 수락하면 `prompt → granted` 변경이 곧바로 오는데 그게 이 경우다.
      */
      if (stateRef.current === "denied") retry();
    }

    /*
      상태 변경은 전부 await 뒤에서 일어난다(위 effect 와 같은 이유 —
      react-hooks/set-state-in-effect).
    */
    async function sync() {
      if (!("geolocation" in navigator)) return;
      // 백그라운드 탭에서는 확인하지 않는다. 다시 보일 때 `visibilitychange` 가 부른다.
      if (document.visibilityState === "hidden") return;

      try {
        const status = await navigator.permissions?.query({
          name: "geolocation",
        });
        if (!status || cancelled) return;

        // 조회할 때마다 새 status 가 온다. 이전 구독을 떼고 최신 것에 붙인다.
        if (watched) watched.onchange = null;
        watched = status;
        status.onchange = () => apply(status.state);

        apply(status.state);
      } catch {
        // 조용히 넘어간다 — 이미 보여 준 상태를 그대로 둔다. 다시 재는 것은 `retry()` 몫이다.
      }
    }

    void sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);

    return () => {
      cancelled = true;
      if (watched) watched.onchange = null;
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, [retry]);

  return { state, firstFix, retry };
}
