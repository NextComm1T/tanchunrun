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
  checking: ["GPS 확인 중", "잠시만 기다려 주세요"],
  denied: ["위치 권한을 허용해야", "러닝을 시작할 수 있습니다"],
  unavailable: ["GPS 신호를 확인할 수 없어", "러닝을 시작할 수 없습니다"],
};

/**
 * 확인이 비정상적으로 오래 끌 때 위 두 줄 **아래에 덧붙이는** 한 줄(#190).
 *
 * 튜플(`readonly [string, string]`)을 넓히지 않고 별도 상수로 둔다 — 넓히면 `denied` ·
 * `unavailable` 까지 쓰지 않는 슬롯을 들고 다닌다.
 *
 * 두 줄을 갈아 끼우지 않는 이유는 확인이 *실패*한 것이 아니라 아직 끝나지 않았기 때문이다.
 * 헤드라인을 오류 문구로 바꾸면 실제보다 나쁜 상태로 보인다.
 *
 * **브라우저 권한 창을 먼저 말한다.** 이 자리에 닿는 흔한 경로가 「권한 창을 열어 둔 채
 * 답하지 않음」이고, 그때 「다시 확인」은 브라우저에 따라 두 번째 창을 띄우지 않아(Chrome ·
 * Edge) 해결을 약속할 수 없다. 사용자가 실제로 할 수 있는 조치를 먼저 두고 버튼은 그 아래
 * 탈출구로 둔다. 초 · 타임아웃 같은 내부 용어는 쓰지 않는다(#125).
 */
export const GPS_CHECKING_STALL_NOTICE =
  "위치 권한을 묻는 창이 떠 있다면 허용을 눌러주세요.";
