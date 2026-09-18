"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  loadNaverMaps,
  NaverMapsLoadError,
  subscribeAuthFailure,
  type MapLoadFailure,
  type NaverLatLng,
  type NaverMap,
  type NaverMapsNamespace,
  type NaverOverlay,
} from "@/client/naverMaps";
import type { Ring, RoutePoint } from "@/domain/measure";

/**
 * 실제 위경도를 그리는 공용 지도(#84 · #78 MAP · D3-B).
 *
 * legacy `TancheonMap`(SVG 일러스트 · 340×220 좌표계)은 마지막 consumer(기록 상세)가 옮겨 온 뒤
 * **#86 에서 삭제됐다.** 실제 위경도를 그리는 공용 지도는 이제 이 파일 하나뿐이다.
 *
 * ## 표시 전용이다
 *
 * 거리 · Zone 판정 · 경계점 생성 · 속도 제외는 **전부 `src/domain/measure`(#82)** 가 한다.
 * 이 컴포넌트는 이미 계산된 `RoutePoint[]` 를 받아 그리기만 한다. 여기에 계산을 넣으면
 * 화면이 보여 주는 값과 서버가 저장한 값이 갈라진다.
 *
 * Zone 폴리곤도 **직접 import 하지 않고 prop 으로 받는다**(#84 구현 범위). 그래야 Zone 을
 * 쓰지 않는 화면이 폴리곤 185정점을 번들에 끌고 오지 않는다.
 *
 * ## 그리지 않는 것
 *
 * 확대 · 축소 · 재중심 버튼, 범례, GPS 안내 카드, 준비 중 딤은 디자인에서 지도 **바깥**의
 * 형제 요소다. legacy 와 같이 각 화면이 지도 위에 그린다. 대신 버튼이 지도를 움직일 수
 * 있도록 `ref` 로 `zoomIn` · `zoomOut` · `recenter` 를 내보내고, 버튼의 disabled 판정에
 * 필요한 값은 `onZoomChange` 로 알려 준다.
 *
 * ## 크기는 부모가 정한다
 *
 * `size-full` 이라 부모 상자에 높이가 있어야 한다. legacy 와 같은 계약이다.
 */

/** 현재 위치 · 끝점에 무엇을 찍을지. */
export type MapMarkerKind =
  /**
   * 지금 위치. **홈의 「내 위치」와 러닝 중 현재 위치가 같은 글리프**다
   * (`TancheonMapBrand.dc.html` L46·L48 ≡ L57·L58). 헤일로 + primary.
   */
  | "current"
  /** 달리는 중이지만 신호를 잃음. 헤일로 없이 유실 색 + 「위치 확인 중…」. */
  | "gps-lost"
  /** 종료된 경로의 끝점. Zone 안이면 primary, 밖이면 route-out(원본 L106). */
  | "finished";

export type MapMarker = {
  lat: number;
  lng: number;
  kind: MapMarkerKind;
  /** `finished` 일 때만 색을 가른다. 나머지 종류는 갈리지 않는다(원본 L105). */
  inZone?: boolean;
};

export type MapStatus = "loading" | "ready" | "credential" | "network";

export type MapZoomState = {
  zoom: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
};

/** 화면이 그리는 확대 · 축소 · 재중심 버튼이 지도를 움직이는 통로. */
export type NaverTancheonMapHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  /** 내 위치로 돌아가고 camera follow 를 다시 켠다(D10). */
  recenter: () => void;
};

type NaverTancheonMapProps = {
  /**
   * `measure()` 가 낸 경로(#82). `tracker_generation → raw_seq → ordinal` 순으로 정렬돼
   * 있어야 한다. **generation · segment 가 바뀌는 자리는 선을 잇지 않는다**(P2).
   */
  route?: readonly RoutePoint[];
  /** 현재 위치 · 끝점 마커. 없으면 찍지 않는다. */
  marker?: MapMarker | null;
  /** 탄천 Ranking Zone 폴리곤(#82 `TANCHEON_ZONE`). 없으면 그리지 않는다. */
  zone?: Ring;
  /** 스크린리더가 읽을 이름. */
  label?: string;
  /** 로드 · 인증 상태가 바뀔 때. 화면이 안내를 함께 그릴 때 쓴다. */
  onStatusChange?: (status: MapStatus) => void;
  /** 확대 단계가 바뀔 때. 화면의 +/− 버튼 disabled 판정에 쓴다. */
  onZoomChange?: (state: MapZoomState) => void;
  ref?: RefObject<NaverTancheonMapHandle | null>;
};

/** 확대 범위. 탄천 한 구간이 보이는 정도에서 시작한다. */
const MIN_ZOOM = 11;
const MAX_ZOOM = 18;
const DEFAULT_ZOOM = 15;

/** camera follow 가 위치를 따라가는 최소 간격(D10 — 최대 2초에 1회). */
const FOLLOW_INTERVAL_MS = 2000;

/** Zone 안 · 밖 선의 굵기와 투명도(legacy `ZONE_LINE` 과 같은 값 · 원본 L89-91). */
const LINE_IN = { weight: 4, opacity: 1 } as const;
const LINE_OUT = { weight: 2.8, opacity: 0.7 } as const;

/**
 * 색은 `globals.css` 토큰에서 **런타임에 읽는다.**
 *
 * SDK 는 `strokeColor` 로 실제 색 문자열을 받지 고 CSS 변수를 받지 않는다. 그렇다고 hex 를
 * 이 파일에 복사하면 토큰과 갈라지므로, 정본을 그대로 읽어 온다(디자인 토큰 규칙).
 */
function token(name: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  // 스타일시트가 아직 안 붙은 경우. 틀린 색으로 그리느니 아무것도 안 그린다.
  return value || "transparent";
}

/** 색이 같은 한 줄. 「신호가 이어진 구간」과는 다른 개념이다(legacy 와 같다). */
type ZoneLine = { points: RoutePoint[]; inZone: boolean };

/** generation · segment 가 같은 점들끼리 끊는다(P2). 구간 사이는 선을 잇지 않는다. */
function splitBySegment(route: readonly RoutePoint[]): RoutePoint[][] {
  const runs: RoutePoint[][] = [];
  let current: RoutePoint[] = [];

  for (const point of route) {
    const previous = current[current.length - 1];
    const continues =
      previous !== undefined &&
      previous.trackerGeneration === point.trackerGeneration &&
      previous.segment === point.segment;

    if (!continues) {
      if (current.length > 0) runs.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 0) runs.push(current);

  return runs;
}

/**
 * 한 구간을 Zone 안 · 밖으로 쪼갠다(R11).
 *
 * **색은 점이 아니라 구간(leg)이 정한다.** `measure()`(#82)가 경계를 지나는 자리마다 경계점을
 * 이미 넣어 줬으므로 모든 leg 는 통째로 안이거나 통째로 밖이다. 그 leg 가 안인지는
 * `from.inZone && to.inZone` 이다 — 경계점은 `inZone: true` 라서 「Zone 안 점 → 경계점」은
 * 안이 되고 「경계점 → Zone 밖 점」은 밖이 된다.
 *
 * 점 하나의 `inZone` 으로 칠하면 **경계점 다음 leg 가 Zone 안 색으로 새어 나간다.**
 * legacy `TancheonMap` 은 경계점을 화면이 직접 만들어 넣는 mock 좌표 모델이라 그 방식이
 * 맞았지만, `measure()` 의 출력에는 그대로 옮길 수 없다.
 *
 * 색이 바뀌는 자리의 점은 앞뒤 선이 함께 갖는다 — 그래야 선이 끊겨 보이지 않는다.
 *
 * P9 로 거리에서 빠진 구간(`excludedFromPrevReason`)은 **일반 구간과 같은 스타일로 그린다**
 * (`docs/05-policy.md:22`). 그래서 여기서 따로 보지 않는다.
 */
function splitByZone(run: readonly RoutePoint[]): ZoneLine[] {
  const lines: ZoneLine[] = [];
  if (run.length < 2) return lines;

  let current: ZoneLine | null = null;
  for (let i = 1; i < run.length; i++) {
    const from = run[i - 1];
    const to = run[i];
    const inZone = from.inZone && to.inZone;

    if (current && current.inZone === inZone) {
      current.points.push(to);
      continue;
    }

    current = { points: [from, to], inZone };
    lines.push(current);
  }

  return lines;
}

/** 폴리곤 · 경로가 없을 때 지도를 어디에 둘지. 표시용 중심이지 계산이 아니다. */
function ringCenter(
  maps: NaverMapsNamespace,
  ring: Ring,
): NaverLatLng | null {
  if (ring.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lng, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  return new maps.LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2);
}

/** 마커 글리프. Tailwind 클래스가 아니라 토큰 변수를 직접 쓴다 — SDK 가 HTML 문자열로 넣는다. */
function markerContent(kind: MapMarkerKind, inZone: boolean): string {
  if (kind === "gps-lost") {
    return `<div style="position:relative;width:26px;height:26px">
      <div style="position:absolute;left:6px;top:6px;width:14px;height:14px;border-radius:9999px;background:var(--color-gps-lost);border:2.5px solid var(--color-surface)"></div>
      <div style="position:absolute;left:50%;top:-16px;transform:translateX(-50%);white-space:nowrap;font-size:11px;font-weight:600;color:var(--color-muted)">위치 확인 중…</div>
    </div>`;
  }

  if (kind === "finished") {
    const fill = inZone ? "var(--color-primary)" : "var(--color-route-out)";
    return `<div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center">
      <div style="width:13px;height:13px;border-radius:9999px;background:${fill};border:2px solid var(--color-surface)"></div>
    </div>`;
  }

  // current — 헤일로 + primary. 홈의 「내 위치」와 러닝 중 현재 위치가 같은 글리프다.
  return `<div style="position:relative;width:34px;height:34px">
    <div style="position:absolute;inset:0;border-radius:9999px;background:var(--color-primary);opacity:0.15"></div>
    <div style="position:absolute;left:11px;top:11px;width:12px;height:12px;border-radius:9999px;background:var(--color-primary);border:2.5px solid var(--color-surface)"></div>
  </div>`;
}

const MARKER_ANCHOR: Record<MapMarkerKind, number> = {
  current: 17,
  "gps-lost": 13,
  finished: 13,
};

export function NaverTancheonMap({
  route,
  marker,
  zone,
  label = "탄천 지도",
  onStatusChange,
  onZoomChange,
  ref,
}: NaverTancheonMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<NaverMap | null>(null);
  const mapsRef = useRef<NaverMapsNamespace | null>(null);
  const overlaysRef = useRef<NaverOverlay[]>([]);
  const markerRef = useRef<NaverOverlay | null>(null);

  /** camera follow 는 내부 동작이다(D10) — props 를 늘리지 않는다. */
  const followRef = useRef(true);
  /** 경로에 맞춘 초기 프레이밍을 이미 했는지. 지도 인스턴스당 한 번뿐이다. */
  const didFitRef = useRef(false);
  const lastPanAtRef = useRef(0);
  /** 우리가 스스로 움직이는 중인지. 사용자 제스처와 구분해 follow 를 끄지 않는다. */
  const selfMoveRef = useRef(false);

  const [status, setStatus] = useState<MapStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  /*
    콜백은 ref 에 담아 둔다. 지도 인스턴스를 만드는 effect 가 콜백 identity 때문에 다시
    돌면 지도가 통째로 새로 만들어진다. 갱신은 render 가 아니라 effect 에서 한다.
  */
  const notifyStatus = useRef(onStatusChange);
  const notifyZoom = useRef(onZoomChange);

  useEffect(() => {
    notifyStatus.current = onStatusChange;
    notifyZoom.current = onZoomChange;
  }, [onStatusChange, onZoomChange]);

  const reportZoom = useCallback((map: NaverMap) => {
    const zoom = map.getZoom();
    notifyZoom.current?.({
      zoom,
      canZoomIn: zoom < MAX_ZOOM,
      canZoomOut: zoom > MIN_ZOOM,
    });
  }, []);

  /* ---------------- 지도 생성 · 파기 ---------------- */

  useEffect(() => {
    let cancelled = false;
    let unsubscribeAuth = () => {};
    let removeListeners = () => {};

    async function start() {
      let maps: NaverMapsNamespace;
      try {
        maps = await loadNaverMaps();
      } catch (error) {
        if (cancelled) return;
        const reason: MapLoadFailure =
          error instanceof NaverMapsLoadError ? error.reason : "network";
        setStatus(reason);
        notifyStatus.current?.(reason);
        return;
      }

      if (cancelled) return;
      const container = containerRef.current;
      if (!container) return;

      // 인증 실패는 로드 뒤에 온다. 지도를 만든 뒤에도 바뀔 수 있어 계속 듣는다.
      unsubscribeAuth = subscribeAuthFailure(() => {
        if (cancelled) return;
        setStatus("credential");
        notifyStatus.current?.("credential");
      });

      const center =
        (marker ? new maps.LatLng(marker.lat, marker.lng) : null) ??
        (zone ? ringCenter(maps, zone) : null) ??
        new maps.LatLng(0, 0);

      const map = new maps.Map(container, {
        center,
        zoom: DEFAULT_ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        // 기본 UI 를 끈다. 확대 · 축소 · 재중심은 디자인대로 화면이 그린다.
        mapDataControl: false,
        scaleControl: false,
        logoControl: false,
        zoomControl: false,
      });

      mapsRef.current = maps;
      mapRef.current = map;

      // 사용자가 직접 움직이면 따라가기를 멈춘다(D10). 우리가 움직인 것은 세지 않는다.
      const stopFollow = () => {
        if (selfMoveRef.current) return;
        followRef.current = false;
      };
      const dragListener = maps.Event.addListener(map, "dragstart", stopFollow);
      const zoomListener = maps.Event.addListener(map, "zoom_start", stopFollow);
      const zoomChanged = maps.Event.addListener(map, "zoom_changed", () =>
        reportZoom(map),
      );

      setStatus("ready");
      notifyStatus.current?.("ready");
      reportZoom(map);

      removeListeners = () => {
        maps.Event.removeListener(dragListener);
        maps.Event.removeListener(zoomListener);
        maps.Event.removeListener(zoomChanged);
      };
    }

    void start();

    return () => {
      cancelled = true;
      unsubscribeAuth();
      removeListeners();
      for (const overlay of overlaysRef.current) overlay.setMap(null);
      overlaysRef.current = [];
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
      mapsRef.current = null;
    };
    // 지도 인스턴스는 한 번만 만든다. marker · zone 초기값은 첫 중심에만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, reportZoom]);

  /* ---------------- Zone · 경로 ---------------- */

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!map || !maps || status !== "ready") return;

    for (const overlay of overlaysRef.current) overlay.setMap(null);
    overlaysRef.current = [];

    if (zone && zone.length > 0) {
      overlaysRef.current.push(
        new maps.Polygon({
          map,
          paths: [zone.map(([lng, lat]) => new maps.LatLng(lat, lng))],
          fillColor: token("--color-primary"),
          fillOpacity: 0.09,
          strokeColor: token("--color-primary"),
          strokeWeight: 1.6,
          strokeOpacity: 0.45,
          strokeStyle: "shortdash",
          clickable: false,
        }),
      );
    }

    /*
      경로가 처음 들어오면 전체가 보이도록 한 번 맞춘다.

      legacy 는 화면이 배율에서 `viewBox` 를 계산해 넘겼는데(`home/zoom.ts`), 실지도에는
      그 좌표계가 없다. 그렇다고 `bounds` props 를 새로 뚫으면 #83 · #85 · #86 세 Issue 가
      의존하는 계약이 늘어난다. camera follow 와 같은 급의 **내부 동작**으로 둔다.

      한 번뿐이다 — 러닝 중에 점이 쌓일 때마다 다시 맞추면 화면이 계속 튄다. 그 뒤로는
      camera follow 가 현재 위치를 따라간다.
    */
    const points = route ?? [];
    if (!didFitRef.current && points.length >= 2) {
      didFitRef.current = true;
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLng = Infinity;
      let maxLng = -Infinity;
      for (const p of points) {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lng < minLng) minLng = p.lng;
        if (p.lng > maxLng) maxLng = p.lng;
      }
      selfMoveRef.current = true;
      map.fitBounds(
        new maps.LatLngBounds(
          new maps.LatLng(minLat, minLng),
          new maps.LatLng(maxLat, maxLng),
        ),
        24,
      );
      window.setTimeout(() => {
        selfMoveRef.current = false;
      }, 0);
    }

    for (const run of splitBySegment(points)) {
      for (const line of splitByZone(run)) {
        const style = line.inZone ? LINE_IN : LINE_OUT;
        overlaysRef.current.push(
          new maps.Polyline({
            map,
            path: line.points.map((p) => new maps.LatLng(p.lat, p.lng)),
            strokeColor: token(
              line.inZone ? "--color-primary" : "--color-route-out",
            ),
            strokeWeight: style.weight,
            strokeOpacity: style.opacity,
            strokeLineCap: "round",
            strokeLineJoin: "round",
            clickable: false,
          }),
        );
      }
    }
  }, [route, zone, status]);

  /* ---------------- 마커 · camera follow ---------------- */

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (!map || !maps || status !== "ready") return;

    markerRef.current?.setMap(null);
    markerRef.current = null;
    if (!marker) return;

    const position = new maps.LatLng(marker.lat, marker.lng);
    const anchor = MARKER_ANCHOR[marker.kind];
    markerRef.current = new maps.Marker({
      position,
      map,
      zIndex: 10,
      icon: {
        content: markerContent(marker.kind, marker.inZone ?? false),
        anchor: new maps.Point(anchor, anchor),
      },
    });

    // camera follow — 켜져 있으면 최대 2초에 1회 따라간다. 확대 단계는 유지한다(D10).
    if (!followRef.current) return;
    const now = Date.now();
    if (now - lastPanAtRef.current < FOLLOW_INTERVAL_MS) return;

    lastPanAtRef.current = now;
    selfMoveRef.current = true;
    map.panTo(position);
    // panTo 는 비동기로 움직인다. 같은 tick 에 내리면 제스처로 오인된다.
    window.setTimeout(() => {
      selfMoveRef.current = false;
    }, 0);
  }, [marker, status]);

  /* ---------------- 화면이 쥐는 조작 ---------------- */

  const move = useCallback((run: (map: NaverMap) => void) => {
    const map = mapRef.current;
    if (!map) return;
    selfMoveRef.current = true;
    run(map);
    window.setTimeout(() => {
      selfMoveRef.current = false;
    }, 0);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () =>
        move((map) => map.setZoom(Math.min(MAX_ZOOM, map.getZoom() + 1), true)),
      zoomOut: () =>
        move((map) => map.setZoom(Math.max(MIN_ZOOM, map.getZoom() - 1), true)),
      recenter: () =>
        move((map) => {
          // 재중심은 따라가기를 다시 켜고 즉시 이동한다(D10).
          followRef.current = true;
          lastPanAtRef.current = Date.now();
          const maps = mapsRef.current;
          if (marker && maps) map.panTo(new maps.LatLng(marker.lat, marker.lng));
        }),
    }),
    [move, marker],
  );

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  /* ---------------- 렌더 ---------------- */

  if (status === "credential" || status === "network") {
    return <MapFallback reason={status} onRetry={retry} />;
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label}
      aria-busy={status === "loading"}
      className="size-full bg-map-base"
    />
  );
}

/**
 * 지도 영역만 대체하는 안내(#84 Failure).
 *
 * **측정 · 저장 흐름에 영향을 주지 않는다** — 지도가 안 떠도 홈의 GPS 준비 · 러닝 시작
 * 버튼은 그대로 동작해야 한다. 그래서 카드 전체가 아니라 지도 자리만 이걸로 바뀐다.
 *
 * credential 은 사용자가 할 수 있는 일이 없다(Console · env 설정 문제)라 「다시 시도」를
 * 주지 않는다. network 는 다시 받아 볼 수 있으므로 준다.
 */
function MapFallback({
  reason,
  onRetry,
}: {
  reason: "credential" | "network";
  onRetry: () => void;
}) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-surface-muted px-6 text-center">
      <p role="alert" className="text-content leading-[1.5] font-bold text-subtle">
        {reason === "network" ? (
          <>
            지도를 불러오지 못했습니다.
            <br />
            연결을 확인해 주세요.
          </>
        ) : (
          <>
            지도를 사용할 수 없습니다.
            <br />
            잠시 후 다시 확인해 주세요.
          </>
        )}
      </p>

      {reason === "network" ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-base font-extrabold text-on-primary"
        >
          다시 시도
        </button>
      ) : null}
    </div>
  );
}
