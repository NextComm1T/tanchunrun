/**
 * 측정 계산 domain 의 공개 계약(#82). #83 · #84 · #85 는 여기서만 가져다 쓴다.
 *
 * framework 에 기대지 않는 순수 TypeScript 다 — React · Next · DB · 지도 SDK 를 import 하지 않고,
 * `src/server` 를 import 하지 않는다(D12).
 */

export {
  ZONE_VERSION,
  TANCHEON_ZONE,
  type LngLat,
  type Ring,
} from "./zone";

export {
  ON_EDGE_EPS,
  haversineM,
  isInZone,
  isValidLatLng,
  zoneCrossings,
} from "./geo";

export {
  GPS_GAP_MS,
  GPS_WARNING_AFTER_MS,
  MAX_ACCURACY_M,
  MIN_SAMPLE_INTERVAL_MS,
  RUN_START_CLOCK_TOLERANCE_MS,
  classifyFix,
  isWithinRunStart,
  resolveSegment,
  type Fix,
  type FixClass,
  type LastAccepted,
} from "./fix";

export {
  CURRENT_PACE_MIN_DISTANCE_M,
  CURRENT_PACE_WINDOW_MS,
  MAX_SPEED_KMH,
  currentPace,
  measure,
  type CurrentPaceOptions,
  type ExcludedReason,
  type MeasureOptions,
  type MeasureResult,
  type RawPoint,
  type RoutePoint,
} from "./measure";
