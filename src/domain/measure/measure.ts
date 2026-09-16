/**
 * 측정 계산 — client(실시간 표시)와 server(종료 시 저장값 확정)가 **같은 식 하나**를 쓴다.
 *
 * 정책 순서가 고정이다(P9 → P2 → P5 · R11).
 * 1. 시속 25km 초과 구간을 총 거리 · 인정 거리 **두 값 모두**에서 뺀다(P9).
 * 2. segment · generation 이 바뀌는 곳은 구간이 아니다 — 거리 0, 선을 잇지 않는다(P2).
 * 3. 남은 구간이 Zone 경계와 만나면 경계점으로 쪼개고, 안쪽 조각만 인정 거리에 더한다(P5 · R11).
 * 4. P9 로 빠진 구간에는 경계점을 만들지 않는다 — 경계점이 속도 판정 단위를 쪼개지 않는다.
 *
 * NaN · 범위 밖 좌표 · 시각 역전 · 중복 시각은 예외로 터지지 않고 **그 구간 거리 0** 으로 처리한다.
 * 좌표를 로그로 출력하지 않는다.
 */

import { haversineM, isInZone, isValidLatLng, zoneCrossings } from "./geo";
import { TANCHEON_ZONE, type Ring } from "./zone";

/** 이 속도를 넘는 구간은 두 거리 모두에서 뺀다(P9). 초과만 제외하고 같은 값은 인정한다. */
export const MAX_SPEED_KMH = 25;

/** 현재 페이스를 내는 창(R17). */
export const CURRENT_PACE_WINDOW_MS = 15_000;

/** 창 안에서 이만큼도 못 움직였으면 현재 페이스를 내지 않는다(R17). */
export const CURRENT_PACE_MIN_DISTANCE_M = 10;

/** GPS 에서 받아 그대로 올린 측정 지점. 저장 뒤에는 바뀌지 않는다. */
export type RawPoint = {
  trackerGeneration: number;
  /** `(session_id, tracker_generation)` 마다 1 부터(D11). accept 된 fix 에만 붙는다. */
  rawSeq: number;
  segment: number;
  lat: number;
  lng: number;
  /** epoch ms. DB `timestamptz` 로의 변환은 #83 몫이다. */
  recordedAt: number;
  accuracy?: number;
};

/**
 * 구간이 빠진 사유. 현재 값은 `speed` 하나뿐이다.
 *
 * GPS 끊김(P2)은 이 값이 아니라 segment 가 바뀌는 것으로 표현하고, 좌표 · 시각이 못 쓸 값이라
 * 빠진 구간도 사유를 붙이지 않는다(거리 0 으로만 처리한다).
 */
export type ExcludedReason = "speed";

/** 경로 한 점. 측정 지점과 계산으로 만든 경계점이 같은 배열에 섞여 있다. */
export type RoutePoint = {
  trackerGeneration: number;
  rawSeq: number;
  /** 측정 지점은 0, 그 점과 다음 측정 지점 사이 경계점은 1 · 2 … */
  ordinal: number;
  kind: "measured" | "boundary";
  segment: number;
  lat: number;
  lng: number;
  recordedAt: number;
  inZone: boolean;
  /**
   * 같은 generation · 같은 segment 의 **직전 측정 지점 → 이 지점** 구간의 제외 사유다.
   * 점 하나에 붙는 표시가 아니다 — #11 이 `speed` 면 #10→#11 만 빠지고 #11→#12 는 그대로다.
   * 경계점(ordinal ≥ 1)에는 복사하지 않는다.
   */
  excludedFromPrevReason: ExcludedReason | null;
};

export type MeasureOptions = {
  zone?: Ring;
  /**
   * 평균 페이스의 분모가 될 총 시간(ms). #85 는 서버 `started_at` 기준 값을 넘긴다.
   * 없으면 첫 측정 지점과 마지막 측정 지점의 시각 차를 쓴다.
   */
  elapsedMs?: number;
};

export type MeasureResult = {
  /** `tracker_generation → raw_seq → ordinal` 순으로 정렬돼 있다. */
  routePoints: RoutePoint[];
  totalDistanceM: number;
  tancheonDistanceM: number;
  /** 초/km. 총 거리가 0 이거나 총 시간이 0 이하면 `null` 이다. */
  averagePaceSecPerKm: number | null;
};

const MAX_SPEED_MPS = (MAX_SPEED_KMH * 1000) / 3600;

/** 두 점이 하나의 구간을 이루는가. generation 이나 segment 가 다르면 이어지지 않는다(P2). */
function isSameSegment(a: RawPoint, b: RawPoint): boolean {
  return a.trackerGeneration === b.trackerGeneration && a.segment === b.segment;
}

function isUsable(point: RawPoint): boolean {
  return isValidLatLng(point.lat, point.lng) && Number.isFinite(point.recordedAt);
}

function byGenerationThenSeq(a: RawPoint, b: RawPoint): number {
  return a.trackerGeneration - b.trackerGeneration || a.rawSeq - b.rawSeq;
}

type Leg = {
  /** 이 구간의 총 거리(m). 빠진 구간은 0 이다. */
  distanceM: number;
  /** 이 구간에서 Zone 안으로 인정한 거리(m). */
  tancheonM: number;
  /** 구간에 걸린 시간(ms). 빠진 구간은 0 이다. */
  durationMs: number;
  reason: ExcludedReason | null;
  /** Zone 경계를 지나는 지점의 매개변수. 오름차순이다. */
  crossings: number[];
};

const EMPTY_LEG: Leg = {
  distanceM: 0,
  tancheonM: 0,
  durationMs: 0,
  reason: null,
  crossings: [],
};

/** 이어진 두 측정 지점 사이 한 구간을 계산한다. 정책 순서(P9 → P5 · R11)가 여기 들어 있다. */
function measureLeg(from: RawPoint, to: RawPoint, zone: Ring): Leg {
  if (!isSameSegment(from, to)) return EMPTY_LEG;
  if (!isUsable(from) || !isUsable(to)) return EMPTY_LEG;

  const durationMs = to.recordedAt - from.recordedAt;
  if (durationMs <= 0) return EMPTY_LEG;

  const distanceM = haversineM(from.lat, from.lng, to.lat, to.lng);
  if (distanceM === 0) return { ...EMPTY_LEG, durationMs };

  if (distanceM / (durationMs / 1000) > MAX_SPEED_MPS) {
    return { ...EMPTY_LEG, reason: "speed" };
  }

  const crossings = zoneCrossings(from.lat, from.lng, to.lat, to.lng, zone);
  const bounds = [0, ...crossings, 1];
  let tancheonM = 0;
  for (let i = 0; i < bounds.length - 1; i++) {
    const mid = (bounds[i] + bounds[i + 1]) / 2;
    const midLat = from.lat + (to.lat - from.lat) * mid;
    const midLng = from.lng + (to.lng - from.lng) * mid;
    if (isInZone(midLat, midLng, zone)) {
      tancheonM += distanceM * (bounds[i + 1] - bounds[i]);
    }
  }

  return { distanceM, tancheonM, durationMs, reason: null, crossings };
}

/** 첫 측정 지점과 마지막 측정 지점의 시각 차(ms). `elapsedMs` 를 받지 못했을 때의 대체값이다. */
function spanMs(sorted: readonly RawPoint[]): number {
  const usable = sorted.filter(isUsable);
  if (usable.length < 2) return 0;

  return usable[usable.length - 1].recordedAt - usable[0].recordedAt;
}

function averagePace(distanceM: number, elapsedMs: number): number | null {
  if (distanceM <= 0 || elapsedMs <= 0) return null;

  return elapsedMs / 1000 / (distanceM / 1000);
}

/**
 * 측정 지점들로 경로와 수치를 낸다. 입력 배열과 그 원소를 바꾸지 않고, 같은 입력이면 같은 출력이다.
 *
 * 조각의 인정 여부는 **조각의 중점**으로 판정한다. 경계 위 점을 Zone 안으로 보기로 했으므로(D9)
 * 「양 끝이 모두 Zone 안인 조각」은 모든 조각에 해당해 버려서 판정 기준이 되지 못한다.
 */
export function measure(
  points: readonly RawPoint[],
  options: MeasureOptions = {},
): MeasureResult {
  const zone = options.zone ?? TANCHEON_ZONE;
  const sorted = [...points].sort(byGenerationThenSeq);
  const routePoints: RoutePoint[] = [];
  let totalDistanceM = 0;
  let tancheonDistanceM = 0;

  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i];
    const previous = i > 0 ? sorted[i - 1] : null;
    const leg = previous ? measureLeg(previous, point, zone) : EMPTY_LEG;

    totalDistanceM += leg.distanceM;
    tancheonDistanceM += leg.tancheonM;

    if (previous) {
      leg.crossings.forEach((t, index) => {
        routePoints.push({
          trackerGeneration: previous.trackerGeneration,
          rawSeq: previous.rawSeq,
          ordinal: index + 1,
          kind: "boundary",
          segment: previous.segment,
          lat: previous.lat + (point.lat - previous.lat) * t,
          lng: previous.lng + (point.lng - previous.lng) * t,
          recordedAt: Math.round(
            previous.recordedAt + (point.recordedAt - previous.recordedAt) * t,
          ),
          inZone: true,
          excludedFromPrevReason: null,
        });
      });
    }

    routePoints.push({
      trackerGeneration: point.trackerGeneration,
      rawSeq: point.rawSeq,
      ordinal: 0,
      kind: "measured",
      segment: point.segment,
      lat: point.lat,
      lng: point.lng,
      recordedAt: point.recordedAt,
      inZone: isInZone(point.lat, point.lng, zone),
      excludedFromPrevReason: leg.reason,
    });
  }

  return {
    routePoints,
    totalDistanceM,
    tancheonDistanceM,
    averagePaceSecPerKm: averagePace(
      totalDistanceM,
      options.elapsedMs ?? spanMs(sorted),
    ),
  };
}

export type CurrentPaceOptions = {
  zone?: Ring;
  /** 러닝 시작 시각(epoch ms). #83 은 서버 `started_at` 을 넘긴다. 없으면 첫 측정 지점 시각이다. */
  startedAt?: number;
};

/**
 * 화면에만 보여 주는 현재 페이스(초/km) — 최근 15초의 이동 거리와 시간으로 낸다(R17).
 *
 * GPS 가 끊긴 시간과 P9 로 빠진 구간은 거리에서도 시간에서도 뺀다. 창에 걸치는 구간은
 * 걸친 만큼만 센다. 시작 후 15초가 안 됐거나 창 안에서 10m 미만이면 `null` 이다.
 */
export function currentPace(
  points: readonly RawPoint[],
  nowMs: number,
  options: CurrentPaceOptions = {},
): number | null {
  const zone = options.zone ?? TANCHEON_ZONE;
  const sorted = [...points].sort(byGenerationThenSeq);
  const usable = sorted.filter(isUsable);
  if (usable.length < 2) return null;

  const startedAt = options.startedAt ?? usable[0].recordedAt;
  if (nowMs - startedAt < CURRENT_PACE_WINDOW_MS) return null;

  const windowStart = nowMs - CURRENT_PACE_WINDOW_MS;
  let distanceM = 0;
  let durationMs = 0;

  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1];
    const to = sorted[i];
    const leg = measureLeg(from, to, zone);
    if (leg.durationMs <= 0 || leg.distanceM === 0) continue;

    const overlap =
      Math.min(to.recordedAt, nowMs) - Math.max(from.recordedAt, windowStart);
    if (overlap <= 0) continue;

    const share = Math.min(1, overlap / leg.durationMs);
    distanceM += leg.distanceM * share;
    durationMs += leg.durationMs * share;
  }

  if (distanceM < CURRENT_PACE_MIN_DISTANCE_M || durationMs <= 0) return null;

  return durationMs / 1000 / (distanceM / 1000);
}
