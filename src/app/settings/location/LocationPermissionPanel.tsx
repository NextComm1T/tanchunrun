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

        `denied` 는 버튼이 있어도 브라우저가 다시 묻지 않는다(#124) — 눌러도 아무 일도
        일어나지 않는 고장 난 버튼처럼 보인다. 그래서 `denied` 에서는 버튼을 아예 빼고,
        브라우저 설정 안내를 그 자리의 주 동선으로 올린다. `prompt` · `unknown` 은 버튼이
        실제로 프롬프트를 띄울 수 있어 그대로 둔다.
      */}
      {state === "ready" && needsPermissionAction(permission) ? (
        needsBrowserSettings(permission) ? (
          /*
            오류가 아니라 사용자가 고를 수 있는 상태다 — `ARCHITECTURE.md` 토큰 표의
            「GPS 약함 · 경고」(warning)를 쓰고 error 계열은 쓰지 않는다. 렌더와 함께
            나타나는 안내라 assertive 로 끼어들 이유도 없어 `role="status"` 다.
          */
          <p
            role="status"
            className="mt-1.5 rounded-2xl border-[1.5px] border-warning-border bg-warning-soft px-5 py-[18px] text-center text-note leading-[1.6] font-bold text-warning"
          >
            이미 거부한 상태라 브라우저가 다시 묻지 않습니다. 브라우저 설정의
            사이트 권한에서 위치를 허용해 주세요.
          </p>
        ) : (
          <button
            type="button"
            onClick={request}
            disabled={requesting}
            className="mt-1.5 h-[58px] w-full rounded-xl bg-primary text-button font-extrabold text-on-primary shadow-primary disabled:opacity-60"
          >
            위치 권한 허용하기
          </button>
        )
      ) : null}
    </>
  );
}
