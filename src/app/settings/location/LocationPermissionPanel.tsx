"use client";

import type { ReactNode } from "react";

import { ErrorCard } from "../ErrorCard";
import {
  needsBrowserSettings,
  needsPermissionAction,
} from "../locationPermission";
import { useLocationPermission } from "../useLocationPermission";

import { PermissionStatusCard } from "./PermissionStatusCard";

/**
 * 위치정보 화면에서 **브라우저 권한에 따라 달라지는 부분**(#88).
 *
 * 상태 카드(맨 위)와 허용 버튼(맨 아래)이 같은 값을 봐야 하는데 그 사이에 고지 카드 네 장이
 * 끼어 있다. 조회를 두 번 하면 둘이 어긋날 수 있으므로 **조회를 여기서 한 번만** 하고,
 * 사이에 들어가는 고지 카드는 `children` 으로 받아 그대로 통과시킨다 — server component 가
 * 그린 것이라 client 번들에 들어가지 않는다.
 */
export function LocationPermissionPanel({ children }: { children: ReactNode }) {
  const { state, permission, request, requesting, retry } =
    useLocationPermission();

  return (
    <>
      {state === "error" ? (
        <ErrorCard message="권한 상태를 확인하지 못했어요." onRetry={retry} />
      ) : (
        <PermissionStatusCard
          loading={state === "loading"}
          permission={permission}
        />
      )}

      {children}

      {/*
        디자인은 미허용일 때만 버튼을 그린다(L470). 조회 중이거나 실패했을 때는 허용 여부를
        확신할 수 없어 띄우지 않는다 — 그때의 다음 행동은 "다시 시도"다.
      */}
      {state === "ready" && needsPermissionAction(permission) ? (
        <>
          <button
            type="button"
            onClick={request}
            disabled={requesting}
            className="mt-1.5 h-[58px] w-full rounded-xl bg-primary text-button font-extrabold text-on-primary shadow-primary disabled:opacity-60"
          >
            위치 권한 허용하기
          </button>

          {/*
            한 번 거부하면 브라우저가 다시 묻지 않는다. 버튼을 눌러도 아무 일이 없는 것처럼
            보이므로 어디서 풀어야 하는지 알려 준다.
          */}
          {needsBrowserSettings(permission) ? (
            <p className="text-center text-note leading-[1.6] font-medium text-muted">
              이미 거부한 상태라 브라우저가 다시 묻지 않습니다. 브라우저 설정의
              사이트 권한에서 위치를 허용해 주세요.
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}
