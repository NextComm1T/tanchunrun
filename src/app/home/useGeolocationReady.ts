"use client";

import { useCallback, useEffect, useState } from "react";

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

  return { state, firstFix, retry };
}
