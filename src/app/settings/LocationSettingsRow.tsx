"use client";

import {
  PERMISSION_LABEL,
  PERMISSION_TONE,
  type LocationPermission,
} from "./locationPermission";
import { SettingsLinkRow } from "./SettingsRow";
import { useLocationPermission } from "./useLocationPermission";

/**
 * 「개인정보 및 권한」 첫 줄 — 위치정보(디자인 L405-410).
 *
 * 이 화면에서 값이 **서버가 아니라 브라우저**에서 오는 유일한 줄이라 여기만 client 다.
 * 권한은 기기마다 다르고 서버는 모른다.
 *
 * 디자인은 문구와 쉐브론을 **같은 색**으로 칠한다(L407 `color:{{ locationStatusColor }}` 가
 * 둘을 감싸는 div 에 붙는다). 그래서 `trailing` 만 넘기지 않고 `trailingClassName` 까지
 * 함께 정한다.
 *
 * 조회에 실패해도 이 줄에서는 「확인 불가」까지만 말한다 — 다시 시도는 이 줄이 열어 주는
 * 위치정보 화면에 있고, 목록 한 줄에 오류 카드를 끼워 넣으면 설정 전체가 고장 난 것처럼 보인다.
 */
export function LocationSettingsRow() {
  const { state, permission } = useLocationPermission();

  // 조회 실패도 「확인 불가」로 보인다 — 알 수 없다는 점에서 결과가 같다.
  const resolved: LocationPermission = state === "error" ? "unknown" : permission;

  return (
    <SettingsLinkRow
      href="/settings/location"
      label="위치정보"
      trailing={
        state === "loading" ? (
          <>
            {/* 값이 들어와도 줄 높이가 튀지 않도록 자리를 지킨다. */}
            <span
              aria-hidden="true"
              className="block h-[18px] w-12 animate-pulse rounded-full bg-surface-muted"
            />
            <span role="status" className="sr-only">
              위치 권한 상태를 확인하는 중이에요
            </span>
          </>
        ) : (
          <span className="text-sm font-bold">{PERMISSION_LABEL[resolved]}</span>
        )
      }
      trailingClassName={
        state === "loading" ? "text-disabled" : PERMISSION_TONE[resolved]
      }
    />
  );
}
