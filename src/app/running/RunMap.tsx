"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import otterGps from "@assets/otter-gps.png";

import {
  NaverTancheonMap,
  type MapZoomState,
  type NaverTancheonMapHandle,
} from "@/components/shared/NaverTancheonMap";
import { TANCHEON_ZONE, type RoutePoint } from "@/domain/measure";

/**
 * 러닝 중 지도와 그 위에 얹히는 것들(디자인 L228-262).
 *
 * 지도는 공용 `NaverTancheonMap`(#84)이다 — 실제 위경도를 그린다. 확대 · 축소 · 재중심
 * 버튼, 범례, GPS 경고 카드, 딤은 디자인에서 지도 **바깥**의 형제 요소라 이 화면이 그린다.
 *
 * **SDK 가 못 떠도 이 화면은 계속 돈다.** 지도가 fallback 을 보이는 동안에도 측정 · 업로드 ·
 * 수치 표시는 멈추지 않는다(#83) — 지도는 보조 표시이고 러닝의 진행 조건이 아니다.
 *
 * 디자인 L258 의 "GPS 복구 시뮬레이션 →" 버튼은 넣지 않는다. 디자인 캔버스에서 상태를
 * 보여 주려고 둔 데모 장치다.
 */

type RunMapProps = {
  /** `measure()` 가 낸 경로(#82). 정렬 · 끊김이 이미 반영돼 있다. */
  route: readonly RoutePoint[];
  /** 현재 위치. 신호를 잃은 동안에는 마지막 위치에 고정된다. */
  marker: { lat: number; lng: number } | null;
  gpsLost: boolean;
};

/**
 * 지도 위에 뜨는 버튼. 시각 크기를 두고 터치 영역만 ::after 로 넓힌다.
 *
 * `relative` 를 여기 넣지 않는 이유는 홈(`RunMapCard`)과 같다 — 재중심 버튼의 `absolute` 와
 * 겹쳐 버튼이 엉뚱한 자리에 놓인다.
 */
const MAP_BUTTON =
  "flex items-center justify-center bg-surface/94 after:absolute after:content-[''] disabled:text-disabled";

export function RunMap({ route, marker, gpsLost }: RunMapProps) {
  const mapRef = useRef<NaverTancheonMapHandle | null>(null);
  const [zoomState, setZoomState] = useState<MapZoomState | null>(null);

  // 매 렌더마다 새 객체를 넘기면 마커를 다시 만든다. 좌표 · 종류가 바뀔 때만 새로 만든다.
  const mapMarker = useMemo(
    () =>
      marker
        ? ({
            lat: marker.lat,
            lng: marker.lng,
            kind: gpsLost ? ("gps-lost" as const) : ("current" as const),
          } as const)
        : null,
    [marker, gpsLost],
  );

  return (
    <div className="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-2xl border-[1.5px] border-border shadow-card">
      <div className="absolute inset-0">
        <NaverTancheonMap
          ref={mapRef}
          route={route}
          marker={mapMarker}
          zone={TANCHEON_ZONE}
          label="러닝 경로 지도"
          onZoomChange={setZoomState}
        />
      </div>

      {/* 확대 · 축소 (L231-234) — 맞붙은 변을 침범하지 않게 바깥쪽으로만 넓힌다 */}
      <div className="absolute top-3 right-3 flex flex-col rounded-sm shadow-raised">
        <button
          type="button"
          aria-label="지도 확대"
          disabled={zoomState !== null && !zoomState.canZoomIn}
          onClick={() => mapRef.current?.zoomIn()}
          className={`${MAP_BUTTON} relative size-[34px] rounded-t-sm border-b border-border text-[19px] font-extrabold text-foreground after:-inset-x-[7px] after:-top-[7px] after:bottom-0`}
        >
          +
        </button>
        <button
          type="button"
          aria-label="지도 축소"
          disabled={zoomState !== null && !zoomState.canZoomOut}
          onClick={() => mapRef.current?.zoomOut()}
          className={`${MAP_BUTTON} relative size-[34px] rounded-b-sm text-[19px] font-extrabold text-foreground after:-inset-x-[7px] after:top-0 after:-bottom-[7px]`}
        >
          −
        </button>
      </div>

      {/* 재중심 (L235-237) — 내 위치로 돌아가고 camera follow 를 다시 켠다 */}
      <button
        type="button"
        aria-label="내 위치로 돌아가기"
        onClick={() => mapRef.current?.recenter()}
        className={`${MAP_BUTTON} absolute right-3 bottom-3 size-[46px] rounded-lg text-primary shadow-raised after:-inset-px`}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>

      {/* 범례 (L238-246) */}
      <ul className="absolute bottom-3 left-3 rounded-sm bg-surface/90 px-[11px] py-2 shadow-raised">
        <li className="mb-[5px] flex items-center gap-[7px]">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-full border-[2.5px] border-primary bg-primary/22"
          />
          <span className="text-caption leading-none font-bold text-foreground">
            내 위치
          </span>
        </li>
        <li className="flex items-center gap-[7px]">
          <span
            aria-hidden="true"
            className="h-[7px] w-3 shrink-0 rounded-[3px] border-[1.5px] border-dashed border-primary/60 bg-primary/22"
          />
          <span className="text-caption leading-none font-bold text-foreground">
            Ranking Zone
          </span>
        </li>
      </ul>

      {/* GPS 유실 — 토스트가 아니라 지도 위 딤 + 경고 카드다 (L247-261) */}
      {gpsLost ? (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center bg-foreground/28 p-5"
        >
          <div className="w-full max-w-[300px] rounded-2xl border-[1.5px] border-warning-border bg-warning-soft p-[18px] shadow-toast">
            <div className="flex items-center gap-3">
              <Image
                src={otterGps}
                alt=""
                width={52}
                height={44}
                className="h-11 w-13 shrink-0 rounded-xs object-cover"
              />
              <div className="flex-1">
                <p className="text-content font-extrabold text-warning-strong">
                  GPS 신호가 약합니다
                </p>
                <p className="mt-[3px] text-note leading-[1.45] font-medium text-warning">
                  신호가 복구될 때까지 거리를 측정하지 않습니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
