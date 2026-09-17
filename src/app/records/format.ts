/**
 * 기록 화면의 표기 형식. 디자인 원본의 `fmtTime` · `fmtPace`(L1119-1128)와
 * 최고 기록 시간 표기(L1358)를 옮겼다.
 */

/** 페이스를 낼 수 없을 때(디자인 L1125). */
const NO_PACE = "--'--\"";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * `2026-09-09` → `2026. 09. 09`(디자인 L986).
 *
 * 날짜만 있는 값이라 `Date` 로 바꾸지 않는다 — 실행 환경의 timezone 에 따라 하루가 밀릴 수 있다.
 */
export function formatDate(date: string): string {
  const [year, month, day] = date.split("-");

  return `${year}. ${month}. ${day}`;
}

/** 거리(km)는 소수 한 자리. 원본 리터럴(`5.0` · `0.0`)과 빈 상태 표기가 같은 형식이다. */
export function formatDistance(km: number): string {
  return km.toFixed(1);
}

/** 목록의 러닝 시간 — 1시간 미만이면 `mm:ss`, 넘으면 `h:mm:ss`(원본 `fmtTime`). */
export function formatDuration(totalSec: number): string {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  return hours > 0
    ? `${hours}:${pad2(minutes)}:${pad2(seconds)}`
    : `${pad2(minutes)}:${pad2(seconds)}`;
}

/** 개인 최고 기록의 최대 시간 — 단위가 「시:분:초」라 시간이 0 이어도 늘 세 칸이다(L1358). */
export function formatBestDuration(totalSec: number): string {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
}

/** 페이스(초/km) → `5'08"`. 값이 없거나 0 이하면 `--'--"`(원본 `fmtPace`). */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm === null || secPerKm <= 0) return NO_PACE;

  return `${Math.floor(secPerKm / 60)}'${pad2(secPerKm % 60)}"`;
}

/** 미터로 저장된 거리를 화면 표기(km)로. 저장은 m, 표시는 km 다. */
export function metersToKm(meters: number): number {
  return meters / 1000;
}
