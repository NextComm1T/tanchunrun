/**
 * 설정 뒤로가기의 source tab 복귀(#127 · 정본 L1021 · L1171-1172).
 *
 * 정본은 단일 state machine 이라 `settingsReturnTab` 하나로 끝나지만, 이 앱은 라우트가
 * 실제 페이지라 브라우저 history 에 기대면 direct 진입 · 새 탭 · 하위 화면 왕복에서
 * 깨진다(이슈 「확인된 사실」). `sessionStorage` 는 탭 하나에 묶여 있어 새 탭 · 다른 탭의
 * 값을 물려받지 않고, 새로고침·하위 화면 왕복에는 그대로 남는다 — 이 화면이 요구하는
 * "현재 설정 방문에만 유효" 범위와 정확히 겹친다.
 *
 * **한 번 읽으면 지운다** — 그래야 이미 소비한 source 를 다음 direct 진입이 물려받지 않는다.
 */

const STORAGE_KEY = "tanchunrun:settingsReturnTab";

const RETURN_PATH = {
  home: "/home",
  ranking: "/ranking",
  records: "/records",
} as const satisfies Record<string, string>;

export type SettingsReturnTab = keyof typeof RETURN_PATH;

function isReturnTab(value: string | null): value is SettingsReturnTab {
  return value !== null && Object.hasOwn(RETURN_PATH, value);
}

/** 설정 기어를 누르기 직전에 부른다 — 지금 있던 탭을 기록한다(정본 L1171 openSettings). */
export function rememberSettingsReturnTab(tab: SettingsReturnTab): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, tab);
  } catch {
    // 프라이빗 모드 등 sessionStorage 를 못 쓰는 환경 — 뒤로가기는 기본값(/home)으로 떨어진다.
  }
}

/**
 * 설정에서 나갈 때 부른다(정본 L1172 closeSettings). allowlist 밖 · 없음 · 저장소 접근
 * 실패는 전부 `/home` 이다 — 없는 탭으로 보내거나 그대로 멈춰 있지 않는다.
 */
export function consumeSettingsReturnTab(): string {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    return isReturnTab(raw) ? RETURN_PATH[raw] : "/home";
  } catch {
    return "/home";
  }
}
