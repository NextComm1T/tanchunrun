/**
 * 브라우저 위치 권한 상태(#88).
 *
 * 설정 목록의 「위치정보」 줄과 위치정보 화면이 같은 값을 보여야 해서 두 화면이 함께 쓴다.
 * 문구 · 색은 디자인 L1317-1318 그대로다.
 *
 * **서버가 아는 값이 아니다.** 권한은 브라우저가 기기별로 들고 있어서 조회도 표시도
 * client 에서 일어난다(`useLocationPermission`).
 */

/**
 * Permissions API 가 돌려주는 세 값 + 알 수 없음.
 *
 * `prompt` 는 **아직 묻지 않은** 상태다. 디자인에는 허용 · 미허용 둘뿐이라(L1317) 같은
 * 「권한 필요」로 묶는다 — 앱이 위치를 쓸 수 없다는 점에서 거부와 결과가 같고,
 * 사용자가 할 일(허용하기)도 같다. 둘의 차이는 **버튼이 실제로 물어볼 수 있는지**뿐이라
 * 그 구분은 위치정보 화면의 안내에서만 한다.
 *
 * `unknown` 은 조회 결과가 비는 경우다 — Permissions API 나 Geolocation 이 없는 브라우저
 * (Safari 계열)가 여기 해당한다. 조회가 **실패한 것과는 다르다**(그건 오류 상태다).
 */
export type LocationPermission = "granted" | "prompt" | "denied" | "unknown";

/** 권한 조회 자체의 진행 상태. 조회 결과(`LocationPermission`)와 구분한다. */
export type LocationQueryState = "loading" | "error" | "ready";

/** 권한 상태 문구 — 허용 · 미허용은 디자인 L1317 그대로다. */
export const PERMISSION_LABEL: Record<LocationPermission, string> = {
  granted: "사용 중",
  prompt: "권한 필요",
  denied: "권한 필요",
  unknown: "확인 불가",
};

/** 권한 상태 색 — 디자인 L1318 은 허용 `#2F6FE8`(primary) · 미허용 `#EF6A5E`(danger). */
export const PERMISSION_TONE: Record<LocationPermission, string> = {
  granted: "text-primary",
  prompt: "text-danger",
  denied: "text-danger",
  unknown: "text-muted",
};

/**
 * 권한 허용 버튼을 띄울 상태.
 *
 * 디자인은 미허용일 때만 버튼을 그린다(L470 `sc-if locationDenied`) — 허용된 상태에서는
 * 버튼 자체가 없다. 조회 결과가 비는 경우(`unknown`)에도 허용할 길은 있어야 하므로 함께 띄운다.
 */
export function needsPermissionAction(permission: LocationPermission): boolean {
  return permission !== "granted";
}

/**
 * 버튼을 눌러도 브라우저가 묻지 않는 상태.
 *
 * 한 번 거부하면 `getCurrentPosition()` 은 프롬프트 없이 즉시 실패한다. 눌렀는데 아무 일도
 * 일어나지 않는 것처럼 보이므로, 그때는 브라우저 설정에서 풀어야 한다고 알려 준다.
 */
export function needsBrowserSettings(permission: LocationPermission): boolean {
  return permission === "denied";
}
