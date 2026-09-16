/**
 * WGS84 위경도 기하. Zone 판정과 거리 계산이 여기에만 있다.
 *
 * 지도 SDK · 화면 pixel · SVG 좌표는 넣지 않는다(#82 — map vendor 무관).
 */

import { TANCHEON_ZONE, type LngLat, type Ring } from "./zone";

/** 지구 평균 반지름(IUGG). haversine 이 쓴다. */
const EARTH_RADIUS_M = 6_371_008.8;

/**
 * 경계 위 점으로 볼 허용 오차(도). ≈0.1mm 로, GPS 정확도(≤30m)보다 다섯 자리 작다.
 * D9: 경계 위 점은 Zone **안**이다.
 */
export const ON_EDGE_EPS = 1e-9;

/** 두 직선이 평행/퇴화라고 볼 행렬식 한계. 이보다 작으면 교차점을 만들지 않는다. */
const PARALLEL_EPS = 1e-12;

/** 교차 매개변수가 이만큼 끝점에 붙으면 기존 점으로 접는다 — 중복 경계점을 만들지 않는다(D9). */
const T_EPS = 1e-9;

/** 위경도가 실제 좌표인가. 외부에서 온 값은 NaN · 범위 밖일 수 있다. */
export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** 두 점 사이 대권 거리(m). 좌표가 유효하지 않으면 0 이다(예외로 터지지 않는다). */
export function haversineM(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  if (!isValidLatLng(aLat, aLng) || !isValidLatLng(bLat, bLng)) return 0;

  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLng = (bLng - aLng) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 점에서 선분까지의 거리(도 단위). 경계 위 판정에만 쓴다.
 *
 * 좌표는 전부 경도(`x`) · 위도(`y`) 다 — 화면 pixel 이 아니다.
 */
function distanceToEdgeDeg(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq));

  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/**
 * Zone 내부 판정 — ray casting(even-odd)이고, **경계 위 점은 안쪽**이다(D9).
 *
 * 위경도를 그대로 평면으로 다룬다. 37°N · 구간 길이 1km 미만에서 오차는 무시할 수준이다.
 */
export function isInZone(
  lat: number,
  lng: number,
  zone: Ring = TANCHEON_ZONE,
): boolean {
  if (!isValidLatLng(lat, lng)) return false;

  for (let i = 0; i < zone.length - 1; i++) {
    const [ax, ay] = zone[i];
    const [bx, by] = zone[i + 1];
    if (distanceToEdgeDeg(lng, lat, ax, ay, bx, by) <= ON_EDGE_EPS) return true;
  }

  let inside = false;
  for (let i = 0; i < zone.length - 1; i++) {
    const [xi, yi] = zone[i];
    const [xj, yj] = zone[i + 1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * 구간 A→B 가 Zone 경계를 지나는 지점의 매개변수 `t`(0 < t < 1) 목록. 오름차순 · 중복 제거.
 *
 * 끝점에 붙는 교차는 버린다 — A · B 자체가 이미 경로에 있어서 경계점을 또 만들 이유가 없다.
 */
export function zoneCrossings(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
  zone: Ring = TANCHEON_ZONE,
): number[] {
  const startX = aLng;
  const startY = aLat;
  const legX = bLng - aLng;
  const legY = bLat - aLat;
  const ts: number[] = [];

  for (let i = 0; i < zone.length - 1; i++) {
    const edge: LngLat = zone[i];
    const next: LngLat = zone[i + 1];
    const edgeX = next[0] - edge[0];
    const edgeY = next[1] - edge[1];
    const denominator = legX * edgeY - legY * edgeX;
    if (Math.abs(denominator) < PARALLEL_EPS) continue;

    const offsetX = edge[0] - startX;
    const offsetY = edge[1] - startY;
    const t = (offsetX * edgeY - offsetY * edgeX) / denominator;
    const u = (offsetX * legY - offsetY * legX) / denominator;
    if (t <= T_EPS || t >= 1 - T_EPS || u < 0 || u > 1) continue;

    ts.push(t);
  }

  ts.sort((a, b) => a - b);

  return ts.filter((t, i) => i === 0 || t - ts[i - 1] > T_EPS);
}
