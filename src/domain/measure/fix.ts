/**
 * GPS fix 분류와 segment 번호 — D10 CONFIRMED(2026-09-16, #78 ledger).
 *
 * 순수 함수다. watch · timer · gap pending 상태 보관 · P3 경고 표시는 #83 runtime 몫이고,
 * `measure` 는 여기서 정해진 `segment` 를 믿고 다시 판정하지 않는다.
 */

import { isValidLatLng } from "./geo";

/** 이 시간을 넘겨 측정이 비면 다음 accept 에서 segment 를 끊는다(post-hoc). */
export const GPS_GAP_MS = 5000;

/** 이보다 부정확한 fix 는 쓰지 않는다. */
export const MAX_ACCURACY_M = 30;

/** 직전 accept 로부터 이 간격이 지나야 다음 fix 를 받는다. */
export const MIN_SAMPLE_INTERVAL_MS = 1000;

/** gap pending 이 이만큼 지속되면 화면에 GPS 경고를 띄운다(P3). */
export const GPS_WARNING_AFTER_MS = 2000;

/**
 * 러닝 시작 시각보다 이른 fix 를 어디까지 받아 줄지(#145).
 *
 * **기기가 시작 직전의 fix 를 그대로 주는 일이 흔하다** — Core Location 은 캐시된 표본을 먼저
 * 주고, Android 의 마지막 위치도 예전 timestamp 를 달고 온다. 그래서 「시작 이전은 전부 버린다」
 * 로 잘라 버리면 기기 시계가 서버보다 조금 늦기만 해도 측정이 통째로 비어 버린다.
 *
 * 이 값은 **client 의 accept 판정과 server 의 수용 범위가 함께 본다**(`src/server/runs/policy.ts`).
 * 서버가 더 좁으면 client 가 번호를 부여한 점이 영영 거절되고, 그 점 때문에 업로드 · 종료가
 * 막힌다(#145 의 원인). 두 곳이 갈리지 않도록 정본을 여기 하나만 둔다.
 *
 * 미래 쪽(`FUTURE_CLOCK_TOLERANCE_MS`)과 같은 크기다 — 기기 시계가 어느 쪽으로 어긋나든 대칭이다.
 */
export const RUN_START_CLOCK_TOLERANCE_MS = 60_000;

/**
 * 이 fix 가 **이 러닝의 것으로 볼 수 있는 시각**인가(#145).
 *
 * 시작보다 이르더라도 위 허용치 안이면 쓴다. 넘으면 `unusable` 과 같이 다뤄 **번호를 부여하지
 * 않는다** — 번호를 준 뒤 서버가 거절하면 그 자리가 빈 채로 남아 종료가 막히기 때문이다.
 */
export function isWithinRunStart(
  recordedAt: number,
  runStartedAtMs: number,
): boolean {
  if (!Number.isFinite(recordedAt) || !Number.isFinite(runStartedAtMs)) {
    return false;
  }

  return recordedAt >= runStartedAtMs - RUN_START_CLOCK_TOLERANCE_MS;
}

/**
 * fix 판정 결과.
 *
 * - `accept` — 쓴다. rawSeq 부여 · 버퍼 · 업로드 · 수치 · 경로에 들어간다
 * - `downsample` — 유효하지만 너무 자주 왔다. 버리고 상태를 바꾸지 않는다
 * - `duplicate` — 직전 accept 보다 시각이 앞서거나 같다. 버린다
 * - `unusable` — 좌표 · accuracy 가 못 쓸 값이다. gap pending 의 trigger 다
 */
export type FixClass = "accept" | "downsample" | "duplicate" | "unusable";

/** Geolocation 에서 온 한 건. */
export type Fix = {
  lat: number;
  lng: number;
  /** 미터. 없거나 유한하지 않으면 `unusable` 이다. */
  accuracy: number;
  /** epoch ms. */
  recordedAt: number;
};

/** 직전에 accept 된 fix 에서 판정에 필요한 것만. */
export type LastAccepted = {
  recordedAt: number;
  segment: number;
};

/**
 * fix 하나를 분류한다. 판정 순서가 규칙이다 — 못 쓸 값이 먼저고, 그다음 시각 역전, 그다음 간격이다.
 *
 * `lastAccepted` 가 없으면(= 이 generation 의 첫 fix) 값만 유효하면 `accept` 다.
 */
export function classifyFix(
  lastAccepted: LastAccepted | null,
  fix: Fix,
): FixClass {
  const usable =
    isValidLatLng(fix.lat, fix.lng) &&
    Number.isFinite(fix.accuracy) &&
    fix.accuracy <= MAX_ACCURACY_M &&
    Number.isFinite(fix.recordedAt);
  if (!usable) return "unusable";

  if (lastAccepted === null) return "accept";
  if (fix.recordedAt <= lastAccepted.recordedAt) return "duplicate";
  if (fix.recordedAt < lastAccepted.recordedAt + MIN_SAMPLE_INTERVAL_MS) {
    return "downsample";
  }

  return "accept";
}

/**
 * accept 된 fix 가 들어갈 segment 번호. generation 마다 0 에서 시작한다.
 *
 * `gapPending` 은 #83 runtime 이 관측한 끊김(error · PERMISSION_DENIED · unusable fix ·
 * hidden 전환)이다. callback 이 조용한 것만으로는 끊김이 아니라서, 그 경우는 여기서
 * `recordedAt` 차이로 뒤늦게 끊는다.
 */
export function resolveSegment(
  lastAccepted: LastAccepted | null,
  fix: Pick<Fix, "recordedAt">,
  gapPending: boolean,
): number {
  if (lastAccepted === null) return 0;

  const silentTooLong = fix.recordedAt - lastAccepted.recordedAt > GPS_GAP_MS;

  return gapPending || silentTooLong
    ? lastAccepted.segment + 1
    : lastAccepted.segment;
}
