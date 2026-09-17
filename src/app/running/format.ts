/**
 * 러닝 진행 화면의 표기 형식.
 *
 * 값 자체는 전부 측정에서 온다(#82 · #83). 여기 있는 것은 **보여 주는 모양**뿐이다.
 * 숫자 형식은 디자인 `탄천런.dc.html` L1119-1128(`fmtTime` · `fmtPace`) · L1312 에서 옮겼다.
 */

/** 달린 시간. 1시간을 넘기면 시간 자리가 붙는다(원본 `fmtTime`). */
export function formatElapsed(totalSec: number): string {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

/** 거리는 언제나 소수점 두 자리다(원본 L1312). 0 이어도 특수 처리하지 않는다 · F9 ①. */
export function formatDistance(km: number): string {
  return km.toFixed(2);
}

/** 미터로 잰 거리를 화면 단위(km)로. 반올림은 표기에서만 한다. */
export function toKilometres(metres: number): number {
  return metres / 1000;
}

/** 페이스 표기. 잴 수 없으면 `--'--"` 다(원본 `fmtPace`). */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm === null || secPerKm <= 0) return "--'--\"";

  const rounded = Math.round(secPerKm);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;

  return `${minutes}'${String(seconds).padStart(2, "0")}"`;
}
