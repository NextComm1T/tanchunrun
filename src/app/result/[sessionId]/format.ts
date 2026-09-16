/**
 * 결과 화면의 표기 형식(#85). 값은 `getResult` 가 낸다 — 여기 있는 것은 보여 주는 모양뿐이다.
 *
 * `running/format.ts`(#83)와 같은 계산을 각자 갖는다 — 두 화면 폴더가 각자 쓰는 조각이라
 * `components/shared` 로 올리지 않는다(`docs/ARCHITECTURE.md` 규칙 · 기존 mock.ts 도 같은
 * 방식으로 따로 있었다).
 */

/** `run_date`(`YYYY-MM-DD`) 를 디자인 표기(`YYYY. MM. DD`)로. */
export function formatRunDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${year}. ${month}. ${day}`;
}

/** 러닝 시간. 1시간을 넘기면 시간 자리가 붙는다. */
export function formatRunTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 페이스 표기. 잴 수 없으면 `--'--"` 다. */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm === null || secPerKm <= 0) return "--'--\"";
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}'${String(s).padStart(2, "0")}"`;
}
