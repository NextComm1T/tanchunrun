import Image from "next/image";

import otterIcon from "@assets/otter-icon.png";

import { GPS_BADGE_LABEL } from "./gps";
import { SettingsGearLink } from "./SettingsGearLink";
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

        <SettingsGearLink />
      </div>
    </header>
  );
}
