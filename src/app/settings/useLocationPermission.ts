"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  LocationPermission,
  LocationQueryState,
} from "./locationPermission";

/**
 * 브라우저 위치 권한을 **실제로 조회한다**(#88).
 *
 * 예전에는 `?location=denied` · `?state=` 쿼리로 상태를 흉내냈다. 실제 조회가 붙었으므로
 * 그 계약은 없앴다.
 *
 * 홈의 `useGeolocationReady`(#81)와 다른 점은 **측위를 하지 않는다**는 것이다. 홈은 러닝을
 * 시작할 수 있는지 판정해야 해서 권한 + 첫 좌표를 둘 다 본다. 설정은 권한 상태만 보여 주므로
 * 10초짜리 고정밀 측위를 돌릴 이유가 없다.
 */

export type LocationPermissionQuery = {
  state: LocationQueryState;
  permission: LocationPermission;
  /** 브라우저 권한 프롬프트를 띄운다. 이미 거부된 상태면 브라우저가 묻지 않는다. */
  request: () => void;
  requesting: boolean;
  /** 조회에 실패한 뒤 다시 조회한다. */
  retry: () => void;
};

export function useLocationPermission(): LocationPermissionQuery {
  const [state, setState] = useState<LocationQueryState>("loading");
  const [permission, setPermission] = useState<LocationPermission>("unknown");
  const [requesting, setRequesting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    /** `onchange` 를 붙인 status. 정리할 때 떼려고 들고 있는다. */
    let watched: PermissionStatus | undefined;

    /*
      확인 전체를 하나의 비동기 흐름으로 둔다. effect 본문에서 곧바로 setState 하면 렌더가
      연쇄되므로(react-hooks/set-state-in-effect), 상태 변경은 전부 await 뒤에서 일어난다.
      `loading` 으로 되돌리는 것은 effect 가 아니라 `retry()` 가 한다.
    */
    async function detect() {
      /*
        조회할 수단이 없는 것(`unknown`)과 조회하다 실패한 것(`error`)은 다르다.
        Permissions API 가 없는 브라우저에 오류 카드를 띄우면 고칠 수 없는 것을
        고치라고 하는 셈이다.
      */
      if (!("geolocation" in navigator)) {
        if (!cancelled) {
          setPermission("unknown");
          setState("ready");
        }
        return;
      }

      try {
        const status = await navigator.permissions?.query({
          name: "geolocation",
        });
        if (cancelled) return;

        if (!status) {
          setPermission("unknown");
          setState("ready");
          return;
        }

        /*
          브라우저 설정에서 권한을 바꾸면 앱으로 돌아오지 않아도 값이 바뀐다.
          구독해 두지 않으면 화면이 옛 상태를 계속 보여 준다.
        */
        watched = status;
        status.onchange = () => setPermission(status.state);

        setPermission(status.state);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    }

    void detect();

    return () => {
      cancelled = true;
      if (watched) watched.onchange = null;
    };
  }, [attempt]);

  /**
   * 권한 프롬프트는 `getCurrentPosition()` 을 불러야 뜬다 — Permissions API 에는 요청하는
   * 수단이 없다. 받은 좌표는 **쓰지도 저장하지도 않고** 버린다. 묻는 것이 목적이다.
   */
  const request = useCallback(() => {
    if (!("geolocation" in navigator)) return;

    setRequesting(true);

    navigator.geolocation.getCurrentPosition(
      () => {
        setRequesting(false);
        setPermission("granted");
      },
      (error) => {
        setRequesting(false);
        /*
          거부만 확정으로 반영한다. 신호가 잡히지 않아 실패한 것은 권한 문제가 아니라서
          상태를 바꾸지 않는다 — 좌표 · 오류 내용은 로그에 남기지 않는다.
        */
        if (error.code === error.PERMISSION_DENIED) setPermission("denied");
      },
      // 좌표를 쓰지 않으므로 정확도를 올릴 이유가 없다. 캐시된 값이어도 권한 판정에는 충분하다.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: Infinity },
    );
  }, []);

  const retry = useCallback(() => {
    setState("loading");
    setAttempt((n) => n + 1);
  }, []);

  return { state, permission, request, requesting, retry };
}
