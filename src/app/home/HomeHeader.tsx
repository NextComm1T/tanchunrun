import Image from "next/image";
import Link from "next/link";

import otterIcon from "@assets/otter-icon.png";

import { GPS_BADGE_LABEL } from "./gps";
import type { GeolocationReadyState } from "./useGeolocationReady";

/**
 * 홈 달리기 탭 전용 상단(디자인 L686-702).
 *
 * 공용 `Header` 를 쓰지 않는다 — 정본은 제목 · 뒤로 가기가 아니라 로고 · GPS 배지 ·
 * 기어가 한 줄인 전용 구조다(이슈 #42 결정 이력). 공용 컴포넌트를 이 구조에
 * 맞추려고 API 를 바꾸지 않는다(`docs/SCREEN_ASSIGNMENTS.md` 「공통 완료 조건」).
 *
 * 설정은 탭이 아니라 이 기어로 들어간다(`modify/2026-09-14.md` 1번).
 */
export function HomeHeader({ gps }: { gps: GeolocationReadyState }) {
  const isReady = gps === "ready";

  return (
    // 정본의 padding-top 2px 에 기기 노치 높이를 더한다. 공용 Header 와 같은 방식이다.
    <header className="flex items-center justify-between gap-2 px-5 pt-[calc(2px+env(safe-area-inset-top))] pb-2">
      <div className="flex shrink-0 items-center gap-2">
        <Image
          src={otterIcon}
          alt=""
          width={32}
          height={32}
          className="block size-8 rounded-[11px] object-cover"
          priority
        />
        <span className="text-[19px] font-extrabold tracking-[-0.5px] whitespace-nowrap">
          탄천런
        </span>
      </div>

      <div className="flex items-center gap-2">
        <p
          // 상태가 바뀌면 스크린리더가 알아야 한다 — 배지 자체는 늘 자리에 있다.
          aria-live="polite"
          className={`flex items-center gap-1.5 rounded-full px-[11px] py-1.5 text-label font-bold whitespace-nowrap ${
            isReady ? "bg-success-soft text-success" : "bg-surface-muted text-muted"
          }`}
        >
          <span
            aria-hidden="true"
            // 준비완료일 때만 점이 깜빡인다(디자인 L693 pulseDot). 정본 키프레임
            // (1 → 0.35 / 1.6s)과 미세하게 다르지만, 이 하나 때문에 전원이 공유하는
            // globals.css 에 키프레임을 더하지 않는다.
            className={`size-[7px] rounded-full ${
              isReady ? "animate-pulse bg-success-dot" : "bg-disabled"
            }`}
          />
          {GPS_BADGE_LABEL[gps]}
        </p>

        {/* 시각 크기는 디자인대로 32×32 를 두고, ::after 로 터치 영역만 48×48 로 넓힌다
            (`docs/07-screens.md:15`). BackButton 과 같은 방식이다. */}
        <Link
          href="/settings"
          aria-label="설정"
          className="relative flex size-8 shrink-0 items-center justify-center rounded-[11px] bg-surface-muted text-subtle after:absolute after:-inset-2 after:content-['']"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
