import { describe, expect, it } from "vitest";

import { haversineM, isInZone } from "./geo";
import {
  CURRENT_PACE_WINDOW_MS,
  currentPace,
  measure,
  type RawPoint,
} from "./measure";
import { TANCHEON_ZONE, ZONE_VERSION, type Ring } from "./zone";

/**
 * 경계 케이스용 정사각 Zone. 실제 탄천 폴리곤은 정점이 185개라 「경계점이 몇 개 생겼는가」를
 * 눈으로 확인하기 어렵다. 가로 0.01°(≈887m) · 세로 0.01°(≈1,110m).
 */
const SQUARE: Ring = [
  [127.0, 37.0],
  [127.01, 37.0],
  [127.01, 37.01],
  [127.0, 37.01],
  [127.0, 37.0],
];

const inSquare = { zone: SQUARE };

const T0 = 1_760_000_000_000;

/**
 * 기본 간격은 10분이다 — Zone 경계 케이스가 속도(P9)에 걸리지 않고 기하만 보게 하려는 것이다.
 * 속도를 보는 테스트는 `recordedAt` 을 직접 넘긴다.
 */
function point(
  overrides: Partial<RawPoint> & Pick<RawPoint, "rawSeq">,
): RawPoint {
  return {
    trackerGeneration: 1,
    segment: 0,
    lat: 37.005,
    lng: 127.005,
    recordedAt: T0 + overrides.rawSeq * 600_000,
    ...overrides,
  };
}

/** 10초마다 0.0002°(≈17.7m)씩 — 시속 6.4km 로, 러닝 속도이면서 P9 에 걸리지 않는다. */
function tick(
  rawSeq: number,
  lngSteps: number,
  overrides: Partial<RawPoint> = {},
): RawPoint {
  return point({
    rawSeq,
    lng: 127.001 + lngSteps * 0.0002,
    recordedAt: T0 + rawSeq * 10_000,
    ...overrides,
  });
}

function distanceBetween(a: RawPoint, b: RawPoint): number {
  return haversineM(a.lat, a.lng, b.lat, b.lng);
}

describe("measure — Zone 경계 분할(P5 · R11)", () => {
  it("한쪽 점만 Zone 안이면 경계점 1개, 안쪽 부분만 인정한다", () => {
    const points = [
      point({ rawSeq: 1, lng: 126.995 }),
      point({ rawSeq: 2, lng: 127.005 }),
    ];

    const result = measure(points, inSquare);
    const boundaries = result.routePoints.filter((p) => p.kind === "boundary");

    expect(boundaries).toHaveLength(1);
    expect(boundaries[0].lng).toBeCloseTo(127.0, 9);
    expect(boundaries[0].ordinal).toBe(1);
    expect(boundaries[0].rawSeq).toBe(1);
    expect(boundaries[0].inZone).toBe(true);
    expect(boundaries[0].excludedFromPrevReason).toBeNull();
    expect(result.tancheonDistanceM).toBeCloseTo(result.totalDistanceM / 2, 6);
  });

  it("양쪽 점이 모두 밖이어도 Zone 을 가로지르면 경계점 2개와 가로지른 부분을 인정한다", () => {
    const points = [
      point({ rawSeq: 1, lng: 126.995 }),
      point({ rawSeq: 2, lng: 127.015 }),
    ];

    const result = measure(points, inSquare);
    const boundaries = result.routePoints.filter((p) => p.kind === "boundary");

    expect(boundaries.map((p) => p.ordinal)).toEqual([1, 2]);
    expect(boundaries[0].lng).toBeCloseTo(127.0, 9);
    expect(boundaries[1].lng).toBeCloseTo(127.01, 9);
    expect(result.tancheonDistanceM).toBeCloseTo(result.totalDistanceM / 2, 6);
  });

  it("경계점의 시각은 두 측정 지점 사이를 비례로 나눈 값이다", () => {
    const points = [
      point({ rawSeq: 1, lng: 126.995, recordedAt: T0 }),
      point({ rawSeq: 2, lng: 127.005, recordedAt: T0 + 600_000 }),
    ];

    const [boundary] = measure(points, inSquare).routePoints.filter(
      (p) => p.kind === "boundary",
    );

    expect(boundary.recordedAt).toBe(T0 + 300_000);
  });

  it("경계 위의 점은 Zone 안이다", () => {
    expect(isInZone(37.005, 127.0, SQUARE)).toBe(true);
    expect(isInZone(37.0, 127.0, SQUARE)).toBe(true);
    expect(isInZone(37.005, 126.999_999, SQUARE)).toBe(false);
  });

  it("Zone 을 아예 벗어난 구간은 인정 거리가 0 이다", () => {
    const points = [
      point({ rawSeq: 1, lng: 126.99 }),
      point({ rawSeq: 2, lng: 126.995 }),
    ];

    const result = measure(points, inSquare);

    expect(result.totalDistanceM).toBeGreaterThan(0);
    expect(result.tancheonDistanceM).toBe(0);
    expect(result.routePoints.every((p) => !p.inZone)).toBe(true);
  });
});

describe("measure — 속도 제외(P9)", () => {
  it("속도 초과 구간은 경계로 쪼개지 않고 두 거리 모두에서 빠진다", () => {
    const points = [
      point({ rawSeq: 1, lng: 126.995, recordedAt: T0 }),
      point({ rawSeq: 2, lng: 127.005, recordedAt: T0 + 10_000 }),
    ];

    const result = measure(points, inSquare);

    expect(result.totalDistanceM).toBe(0);
    expect(result.tancheonDistanceM).toBe(0);
    expect(result.routePoints.filter((p) => p.kind === "boundary")).toHaveLength(
      0,
    );
    expect(result.routePoints[1].excludedFromPrevReason).toBe("speed");
  });

  it("제외는 구간 단위다 — 앞뒤 정상 구간은 그대로 가산한다", () => {
    const points = [tick(1, 0), tick(2, 1), tick(3, 6), tick(4, 7)];

    const result = measure(points, inSquare);
    const expected =
      distanceBetween(points[0], points[1]) +
      distanceBetween(points[2], points[3]);

    expect(result.totalDistanceM).toBeCloseTo(expected, 6);
    expect(result.routePoints.map((p) => p.excludedFromPrevReason)).toEqual([
      null,
      null,
      "speed",
      null,
    ]);
  });

  it("시속 25km 근방에서 초과만 뺀다", () => {
    const start = point({ rawSeq: 1, lng: 127.001, recordedAt: T0 });
    const degPerMetre =
      0.001 / haversineM(start.lat, start.lng, start.lat, start.lng + 0.001);
    const distanceAt = (kmh: number) => {
      const metres = (kmh * 1000 * 10) / 3600;

      return measure(
        [
          start,
          point({
            rawSeq: 2,
            lng: start.lng + metres * degPerMetre,
            recordedAt: T0 + 10_000,
          }),
        ],
        inSquare,
      ).totalDistanceM;
    };

    expect(distanceAt(24.9)).toBeGreaterThan(0);
    expect(distanceAt(25.1)).toBe(0);
  });
});

describe("measure — 끊김(P2)", () => {
  it("segment 가 바뀌면 구간이 이어지지 않는다", () => {
    const points = [tick(1, 0), tick(2, 1, { segment: 1 })];

    expect(measure(points, inSquare).totalDistanceM).toBe(0);
  });

  it("generation 이 바뀌면 구간이 이어지지 않는다", () => {
    const points = [
      tick(1, 0, { trackerGeneration: 1 }),
      tick(1, 1, { trackerGeneration: 2 }),
    ];

    expect(measure(points, inSquare).totalDistanceM).toBe(0);
  });

  it("끊긴 뒤 이어진 구간은 다시 가산한다", () => {
    const points = [
      tick(1, 0),
      tick(2, 1, { segment: 1 }),
      tick(3, 2, { segment: 1 }),
    ];

    expect(measure(points, inSquare).totalDistanceM).toBeCloseTo(
      distanceBetween(points[1], points[2]),
      6,
    );
  });
});

describe("measure — 못 쓸 값", () => {
  it("좌표가 NaN · 범위 밖이거나 시각이 역전 · 중복이면 터지지 않고 그 구간만 0 이다", () => {
    const cases: RawPoint[][] = [
      [tick(1, 0), tick(2, 1, { lat: Number.NaN })],
      [tick(1, 0), tick(2, 1, { lng: 999 })],
      [tick(1, 0), tick(2, 1, { recordedAt: T0 })],
      [tick(1, 0), tick(2, 1, { recordedAt: T0 + 10_000 })],
    ];

    for (const points of cases) {
      const result = measure(points, inSquare);
      expect(result.totalDistanceM).toBe(0);
      expect(result.tancheonDistanceM).toBe(0);
      expect(result.routePoints[1].excludedFromPrevReason).toBeNull();
    }
  });
});

describe("measure — 정렬 · 불변 · 결정성", () => {
  it("입력 배열과 원소를 바꾸지 않는다", () => {
    const points = [tick(2, 1), tick(1, 0)];
    const snapshot = JSON.stringify(points);

    measure(points, inSquare);

    expect(JSON.stringify(points)).toBe(snapshot);
  });

  it("같은 입력이면 같은 출력이다", () => {
    const points = [
      point({ rawSeq: 1, lng: 126.995 }),
      point({ rawSeq: 2, lng: 127.015 }),
    ];

    expect(JSON.stringify(measure(points, inSquare))).toBe(
      JSON.stringify(measure(points, inSquare)),
    );
  });

  it("generation → rawSeq → ordinal 순으로 정렬해 돌려준다", () => {
    const points = [
      point({ rawSeq: 2, lng: 127.015, trackerGeneration: 1 }),
      point({ rawSeq: 1, lng: 126.995, trackerGeneration: 1 }),
      point({ rawSeq: 1, lng: 127.005, trackerGeneration: 2 }),
    ];

    const order = measure(points, inSquare).routePoints.map((p) => [
      p.trackerGeneration,
      p.rawSeq,
      p.ordinal,
    ]);

    expect(order).toEqual([
      [1, 1, 0],
      [1, 1, 1],
      [1, 1, 2],
      [1, 2, 0],
      [2, 1, 0],
    ]);
  });
});

describe("measure — 평균 페이스", () => {
  it("총 거리가 0 이면 null", () => {
    expect(measure([], inSquare).averagePaceSecPerKm).toBeNull();
    expect(
      measure([tick(1, 0), tick(2, 0)], inSquare).averagePaceSecPerKm,
    ).toBeNull();
  });

  it("총 시간은 elapsedMs 를 우선 쓰고, 없으면 첫 점과 마지막 점의 차를 쓴다", () => {
    const points = [tick(1, 0), tick(2, 1)];
    const distanceKm = measure(points, inSquare).totalDistanceM / 1000;

    expect(measure(points, inSquare).averagePaceSecPerKm).toBeCloseTo(
      10 / distanceKm,
      6,
    );
    expect(
      measure(points, { ...inSquare, elapsedMs: 60_000 }).averagePaceSecPerKm,
    ).toBeCloseTo(60 / distanceKm, 6);
  });
});

describe("currentPace", () => {
  const running = [tick(1, 0), tick(2, 1), tick(3, 2), tick(4, 3)];
  const now = running[3].recordedAt;

  it("시작 후 15초가 안 됐으면 null", () => {
    expect(
      currentPace(running, running[0].recordedAt + CURRENT_PACE_WINDOW_MS - 1, {
        ...inSquare,
        startedAt: running[0].recordedAt,
      }),
    ).toBeNull();
  });

  it("최근 15초 이동이 10m 미만이면 null", () => {
    const still = [tick(1, 0), tick(2, 0), tick(3, 0), tick(4, 0)];

    expect(currentPace(still, still[3].recordedAt, inSquare)).toBeNull();
  });

  it("창에 걸친 구간은 걸친 만큼만 센다", () => {
    const step = distanceBetween(running[2], running[3]);

    // 창 15초에 마지막 구간 10초 전부와 그 앞 구간의 절반이 든다.
    expect(currentPace(running, now, inSquare)).toBeCloseTo(
      15 / ((step * 1.5) / 1000),
      6,
    );
  });

  it("끊긴 구간은 거리에서도 시간에서도 뺀다", () => {
    const withGap = [
      tick(1, 0),
      tick(2, 1),
      tick(3, 2, { segment: 1 }),
      tick(4, 3, { segment: 1 }),
    ];
    const step = distanceBetween(withGap[2], withGap[3]);

    // 2→3 은 segment 가 끊겨 빠지고, 창에는 3→4 의 10초만 남는다.
    expect(currentPace(withGap, withGap[3].recordedAt, inSquare)).toBeCloseTo(
      10 / (step / 1000),
      6,
    );
  });

  it("측정 지점이 2개 미만이면 null", () => {
    expect(currentPace([], now, inSquare)).toBeNull();
    expect(currentPace([tick(1, 0)], now, inSquare)).toBeNull();
  });
});

describe("탄천 Zone 상수(D9)", () => {
  it("version 과 닫힌 ring 형식", () => {
    expect(ZONE_VERSION).toBe("tancheon-zone-v1");
    expect(TANCHEON_ZONE[0]).toEqual(TANCHEON_ZONE[TANCHEON_ZONE.length - 1]);
    expect(TANCHEON_ZONE.length).toBeGreaterThan(3);
  });

  it("탄천 본류 위의 점은 안, 탄천에서 먼 지점은 밖", () => {
    expect(isInZone(37.524327, 127.067433)).toBe(true); // 한강 합류부
    expect(isInZone(37.4842822, 127.1121213)).toBe(true); // 수서 부근 본류
    expect(isInZone(37.4979, 127.0276)).toBe(false); // 강남역
    expect(isInZone(37.4113, 127.1287)).toBe(false); // 야탑역
    expect(isInZone(37.3853, 127.1231)).toBe(false); // 서현역
  });

  it("좌표가 못 쓸 값이면 Zone 밖으로 본다", () => {
    expect(isInZone(Number.NaN, 127.067433)).toBe(false);
    expect(isInZone(37.524327, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("기본 Zone 으로도 본류를 따라 걸은 거리를 인정한다", () => {
    const points = [
      point({ rawSeq: 1, lat: 37.4842822, lng: 127.1121213 }),
      point({ rawSeq: 2, lat: 37.4844895, lng: 127.1119746 }),
      point({ rawSeq: 3, lat: 37.4846464, lng: 127.1118263 }),
    ];

    const result = measure(points);

    expect(result.totalDistanceM).toBeGreaterThan(0);
    expect(result.tancheonDistanceM).toBeCloseTo(result.totalDistanceM, 6);
    expect(result.routePoints.every((p) => p.inZone)).toBe(true);
  });

  it("이 모듈은 지도 SDK · pixel · SVG 좌표를 쓰지 않는다 — 값이 전부 위경도 범위다", () => {
    for (const [lng, lat] of TANCHEON_ZONE) {
      expect(lng).toBeGreaterThan(126);
      expect(lng).toBeLessThan(128);
      expect(lat).toBeGreaterThan(36);
      expect(lat).toBeLessThan(38);
    }
  });
});
