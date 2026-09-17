import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import {
  NaverTancheonMap,
  type MapZoomState,
  type NaverTancheonMapHandle,
} from "@/components/shared/NaverTancheonMap";
import { TANCHEON_ZONE } from "@/domain/measure";

import { GPS_NOTICE, START_BUTTON_LABEL } from "./gps";
import type { GeolocationReadyState } from "./useGeolocationReady";

type RunMapCardProps = {
  gps: GeolocationReadyState;
  /** 러닝을 시작하지 못한 이유. `startRun` 이 실패했을 때만 값이 있다. */
  startError?: string | null;
  /** 첫 측위(#81). `gps` 가 `ready` 일 때만 값이 있고, 그때만 내 위치를 찍는다. */
  position: { latitude: number; longitude: number } | null;
  onStart: () => void;
};

/**
 * 지도 위에 뜨는 46×46 버튼. 시각 크기를 두고 터치 영역만 48×48 로 넓힌다.
 *
 * `position` 은 일부러 넣지 않는다 — ::after 의 기준이 될 positioned 조상만 있으면 되고,
 * 쓰는 쪽이 `relative`(확대 · 축소)와 `absolute`(재중심)로 갈린다. 여기에 `relative` 를
 * 넣으면 재중심 버튼의 `absolute` 와 겹치는데, Tailwind CSS 에서 `.relative` 가 뒤에
 * 나오므로 클래스를 나중에 적어도 `relative` 가 이겨 버튼이 엉뚱한 자리에 놓인다.
 */
const MAP_BUTTON =
  "flex size-[46px] items-center justify-center bg-surface/94 after:absolute after:-inset-px after:content-['']";

/**
 * 탄천 Ranking Zone 지도 카드(디자인 L708-753).
 *
 * 지도 자체는 공용 `NaverTancheonMap`(#84)을 쓴다 — 홈이 실제 위치를 가진 첫 화면이라
 * 일러스트 지도에서 여기부터 옮겼다. 확대 · 축소 · 재중심 버튼, 범례, GPS 안내 딤은
 * 정본에서 지도 바깥의 형제 요소라 여기서 그린다(`NaverTancheonMap.tsx` 주석).
 *
 * 카드 아래 모서리를 둥글리지 않는 건 내 순위 카드와 한 덩어리로 이어지기 때문이다(L755).
 */
export function RunMapCard({
  gps,
  startError,
  position,
  onStart,
}: RunMapCardProps) {
  const isReady = gps === "ready";

  /*
    확대 단계는 이제 지도 인스턴스가 쥔다(NAVER zoom level). 예전에는 화면이 배율에서
    `viewBox` 를 계산해 넘겼지만, 실지도에는 SVG 좌표계가 없어서 `home/zoom.ts` 를 없앴다.
    버튼은 디자인대로 여기서 그리고, 지도를 움직이는 것은 `ref` 로 부른다.
  */
  const mapRef = useRef<NaverTancheonMapHandle | null>(null);
  const [zoomState, setZoomState] = useState<MapZoomState | null>(null);

  // 매 렌더마다 새 객체를 넘기면 마커를 다시 만든다. 좌표가 바뀔 때만 새로 만든다.
  const marker = useMemo(
    () =>
      position
        ? ({
            lat: position.latitude,
            lng: position.longitude,
            kind: "current",
          } as const)
        : null,
    [position],
  );

  return (
    <section className="flex min-h-[400px] flex-1 flex-col overflow-hidden rounded-t-2xl border-[1.5px] border-b-0 border-border bg-surface shadow-card">
      <div className="flex shrink-0 items-start justify-between px-[18px] pt-3.5 pb-2.5">
        <div>
          <h2 className="text-base font-extrabold">탄천 Ranking Zone</h2>
          <p className="mt-[3px] text-[12.5px] font-medium text-muted">
            표시된 구역에서 달린 거리만 랭킹에 반영돼요.
          </p>
        </div>
        <span className="ml-2 shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-caption font-extrabold text-primary-strong">
          구역 확인
        </span>
      </div>

      {/* 지도와 그 위에 얹히는 것들의 좌표 기준. 공용 지도는 부모가 크기를 정해 줘야 한다. */}
      <div className="relative min-h-[320px] flex-1 overflow-hidden">
        <div className="absolute inset-0">
          <NaverTancheonMap
            ref={mapRef}
            marker={marker}
            zone={TANCHEON_ZONE}
            label="탄천 Ranking Zone 지도"
            onZoomChange={setZoomState}
          />
        </div>

        {/* 확대 · 축소. 정본은 컨테이너를 overflow:hidden 으로 잘라 모서리를 둥글리지만,
            그러면 터치 영역을 넓히는 ::after 까지 잘린다. 버튼마다 모서리를 준다. */}
        <div className="absolute top-3 right-3 flex flex-col rounded-lg shadow-raised">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            disabled={zoomState !== null && !zoomState.canZoomIn}
            aria-label="지도 확대"
            className={`${MAP_BUTTON} relative rounded-t-lg border-b border-border text-[19px] font-extrabold text-foreground`}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            disabled={zoomState !== null && !zoomState.canZoomOut}
            aria-label="지도 축소"
            className={`${MAP_BUTTON} relative rounded-b-lg text-[19px] font-extrabold text-foreground`}
          >
            −
          </button>
        </div>

        <button
          type="button"
          onClick={() => mapRef.current?.recenter()}
          aria-label="내 위치로 돌아가기"
          className={`${MAP_BUTTON} absolute right-3 bottom-[100px] rounded-lg text-primary shadow-raised`}
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

        {/* 범례(L744-752). 지도가 무엇을 그리고 있는지 설명하는 글이라 목록으로 둔다. */}
        <ul className="absolute bottom-[102px] left-3 rounded-sm bg-surface/90 px-[11px] py-2 shadow-raised">
          <li className="mb-[5px] flex items-center gap-[7px]">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full border-[2.5px] border-primary bg-primary/22"
            />
            <span className="text-caption leading-none font-bold">내 위치</span>
          </li>
          <li className="flex items-center gap-[7px]">
            <span
              aria-hidden="true"
              className="h-[7px] w-3 rounded-[3px] border-[1.5px] border-dashed border-primary/60 bg-primary/22"
            />
            <span className="text-caption leading-none font-bold">Ranking Zone</span>
          </li>
        </ul>

        {/*
          준비되지 않았을 때 지도를 덮는 안내(L724-730 구조).

          권한 거부일 때만 위치정보 화면으로 가는 길을 함께 준다(#81) — 사용자가 브라우저
          설정을 고쳐야 하는 상황이라 「다시 시도」로는 풀리지 않는다. 측위 실패는 자리를
          옮기면 풀릴 수 있어 안내만 한다.
        */}
        {isReady ? null : (
          <div className="absolute inset-0 z-[6] flex items-center justify-center bg-foreground/26 p-[26px]">
            <div className="w-full rounded-2xl bg-surface px-5 py-[22px] text-center shadow-modal">
              <p
                role={gps === "checking" ? undefined : "alert"}
                className="text-[22px] leading-[1.45] font-extrabold"
              >
                {GPS_NOTICE[gps][0]}
                <br />
                {GPS_NOTICE[gps][1]}
              </p>

              {gps === "denied" ? (
                <Link
                  href="/settings/location"
                  className="mt-3.5 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-base font-extrabold text-on-primary"
                >
                  위치정보 설정 보기
                </Link>
              ) : null}
            </div>
          </div>
        )}

        {/*
          시작에 실패했을 때(#81). 이미 진행 중인 러닝이 있거나 서버가 세션을 만들지 못한
          경우다 — 카운트다운을 되돌리고 이유를 보여 준다. 디자인에 없는 요소라 로그인 ·
          동의 실패 안내와 같은 토큰을 쓴다.
        */}
        {startError ? (
          <p
            role="alert"
            className="absolute right-[calc(28px+3%)] bottom-[104px] left-[calc(28px+3%)] z-[7] rounded-md border-[1.5px] border-error-border bg-error-soft px-4 py-3 text-center text-sm font-bold text-error"
          >
            {startError}
          </p>
        ) : null}

        {/* GPS 확인 전에는 누를 수 없다(P1). 정본도 disabled 로 막고 색을 바꾼다(L1302-1305).
            그림자는 정본이 0 6px 18px / 0.3, 토큰(shadow-primary)은 0 4px 12px / 0.25 다. */}
        <button
          type="button"
          onClick={onStart}
          disabled={!isReady}
          className={`absolute right-[calc(28px+3%)] bottom-[18px] left-[calc(28px+3%)] flex h-[78px] items-center justify-center gap-3 rounded-full text-[23px] font-extrabold tracking-[-0.6px] ${
            isReady
              ? "bg-primary text-on-primary shadow-primary"
              : "bg-disabled-surface text-disabled"
          }`}
        >
          {START_BUTTON_LABEL[gps]}
        </button>
      </div>
    </section>
  );
}
