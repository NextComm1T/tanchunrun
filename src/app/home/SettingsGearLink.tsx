"use client";

import Link from "next/link";

import { rememberSettingsReturnTab } from "@/app/settings/returnTab";

/**
 * 설정 진입(디자인 L702). `HomeHeader` 에서 분리한 이유는 클릭 시 지금 탭을 기억해야
 * 해서(#127) `onClick` 이 필요하고, 그러려면 이 조각만 client 여야 하기 때문이다 —
 * `HomeHeader` 나머지는 그대로 server 로 남는다.
 */
export function SettingsGearLink() {
  return (
    <Link
      href="/settings"
      onClick={() => rememberSettingsReturnTab("home")}
      aria-label="설정"
      // 시각 크기는 디자인대로 32×32 를 두고, ::after 로 터치 영역만 48×48 로 넓힌다
      // (`docs/07-screens.md:15`). BackButton 과 같은 방식이다.
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
  );
}
