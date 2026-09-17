import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import {
  routePoints,
  type ExcludedFromPrevReason,
  type RoutePointKind,
} from "@/server/db/schema";

/**
 * 저장된 경로를 **한 가지 순서로만** 읽는 단일 helper(#83).
 *
 * running 복원 · 결과 화면 · 기록 상세 · 지도 · 종료 처리 검증이 전부 이것을 재사용한다.
 * 같은 ORDER BY 를 여러 곳에 적으면 한 곳만 고쳐졌을 때 화면마다 다른 경로가 나온다.
 *
 * 정렬은 `tracker_generation → raw_seq → ordinal` 이고, **generation 이나 segment 가 바뀌는
 * 자리는 선을 잇지 않는다**(P2 — GPS 가 끊긴 자리를 직선으로 메우지 않는다).
 */

export type StoredRoutePoint = {
  trackerGeneration: number;
  rawSeq: number;
  ordinal: number;
  kind: RoutePointKind;
  segment: number;
  lat: number;
  lng: number;
  /** epoch ms. 계산(#82)이 숫자를 쓰므로 여기서 바꿔 넘긴다. */
  recordedAt: number;
  accuracy: number | null;
  inZone: boolean | null;
  excludedFromPrevReason: ExcludedFromPrevReason | null;
};

/** 끊기지 않고 한 줄로 이어지는 구간. 지도는 이것 하나를 polyline 하나로 그린다. */
export type RouteLine = StoredRoutePoint[];

/**
 * generation · segment 가 바뀌는 자리에서 끊는다.
 *
 * 순수 함수라 이미 읽어 둔 점에도 쓸 수 있다(예: 로컬 버퍼를 합친 뒤).
 */
export function toRouteLines(
  points: readonly StoredRoutePoint[],
): RouteLine[] {
  const lines: RouteLine[] = [];

  for (const point of points) {
    const current = lines.at(-1);
    const previous = current?.at(-1);
    const continues =
      current !== undefined &&
      previous !== undefined &&
      previous.trackerGeneration === point.trackerGeneration &&
      previous.segment === point.segment;

    if (continues) current.push(point);
    else lines.push([point]);
  }

  return lines;
}

export async function getOrderedRoutePoints(sessionId: string): Promise<{
  points: StoredRoutePoint[];
  lines: RouteLine[];
}> {
  const rows = await getDb()
    .select({
      trackerGeneration: routePoints.trackerGeneration,
      rawSeq: routePoints.rawSeq,
      ordinal: routePoints.ordinal,
      kind: routePoints.kind,
      segment: routePoints.segment,
      lat: routePoints.lat,
      lng: routePoints.lng,
      recordedAt: routePoints.recordedAt,
      accuracyM: routePoints.accuracyM,
      inZone: routePoints.inZone,
      excludedFromPrevReason: routePoints.excludedFromPrevReason,
    })
    .from(routePoints)
    .where(eq(routePoints.sessionId, sessionId))
    .orderBy(
      asc(routePoints.trackerGeneration),
      asc(routePoints.rawSeq),
      asc(routePoints.ordinal),
    );

  const points: StoredRoutePoint[] = rows.map((row) => ({
    trackerGeneration: row.trackerGeneration,
    rawSeq: row.rawSeq,
    ordinal: row.ordinal,
    // 값 집합은 DB CHECK 이 보장한다.
    kind: row.kind as RoutePointKind,
    segment: row.segment,
    lat: row.lat,
    lng: row.lng,
    recordedAt: row.recordedAt.getTime(),
    accuracy: row.accuracyM,
    inZone: row.inZone,
    excludedFromPrevReason:
      row.excludedFromPrevReason as ExcludedFromPrevReason | null,
  }));

  return { points, lines: toRouteLines(points) };
}

/**
 * 한 generation 의 측정점(`ordinal = 0`)만. 업로드를 이어 붙일 `rawSeq` 를 정할 때 쓴다.
 *
 * **다음 rawSeq 는 `max + 1` 이지 `ackThroughRawSeq + 1` 이 아니다**(D11). 서버에 1,2,4,5 가
 * 있고 ACK 가 2 인 상태에서 3 부터 다시 부여하면 4 · 5 가 다른 좌표로 재사용돼 충돌한다.
 */
export async function getMeasuredRawSeqs(
  sessionId: string,
  trackerGeneration: number,
): Promise<number[]> {
  const rows = await getDb()
    .select({ rawSeq: routePoints.rawSeq })
    .from(routePoints)
    .where(
      and(
        eq(routePoints.sessionId, sessionId),
        eq(routePoints.trackerGeneration, trackerGeneration),
        eq(routePoints.ordinal, 0),
      ),
    )
    .orderBy(asc(routePoints.rawSeq));

  return rows.map((row) => row.rawSeq);
}
