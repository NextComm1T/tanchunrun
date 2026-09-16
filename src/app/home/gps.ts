import type { GeolocationReadyState } from "./useGeolocationReady";

/**
 * GPS 준비 상태의 문구(#81 · P1).
 *
 * 디자인의 비준비 상태는 「GPS 확인 중」 하나뿐이었다(#42 「상태 정의」). 실제 권한 · 측위가
 * 붙으면서 **거부**와 **측위 실패**가 서로 다른 상황이 됐고, 사용자가 해야 할 일도 다르다 —
 * 거부는 브라우저 설정을 고쳐야 하고, 측위 실패는 자리를 옮겨 다시 시도하면 된다.
 * 그래서 문구를 나눴다(`modify/2026-09-16-run-session.md` 2번).
 */

/** 상단 배지(디자인 L693 · L696). 확인 중의 말줄임은 원본이 애니메이션으로 늘리는 자리다. */
export const GPS_BADGE_LABEL: Record<GeolocationReadyState, string> = {
  checking: "GPS 확인 중...",
  denied: "위치 권한 없음",
  unavailable: "GPS 신호 없음",
  ready: "GPS 준비완료",
};

/** 러닝 시작 버튼(디자인 L1304). 준비되지 않으면 P1 대로 누를 수 없다. */
export const START_BUTTON_LABEL: Record<GeolocationReadyState, string> = {
  checking: "GPS 확인 중...",
  denied: "위치 권한 필요",
  unavailable: "GPS 신호 없음",
  ready: "러닝 시작하기",
};

/**
 * 지도를 덮는 안내(디자인 L724-730 구조). 두 줄로 그린다.
 *
 * 거부 문구는 #81 이 지정한 그대로다 — 위치정보 화면으로 가는 길은 카드가 따로 붙인다.
 */
export const GPS_NOTICE: Record<
  Exclude<GeolocationReadyState, "ready">,
  readonly [string, string]
> = {
  checking: ["GPS 확인 중", "러닝을 준비 중입니다"],
  denied: ["위치 권한을 허용해야", "러닝을 시작할 수 있습니다"],
  unavailable: ["GPS 신호를 확인할 수 없어", "러닝을 시작할 수 없습니다"],
};
