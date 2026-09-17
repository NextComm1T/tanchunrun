"use client";

import Link from "next/link";

import { rememberSettingsReturnTab } from "@/app/settings/returnTab";

/**
 * 설정 진입(디자인 L779). 탭 화면이라 공용 `Header` 를 쓰지 않는다. `page.tsx` 에서 분리한
 * 이유는 클릭 시 지금 탭을 기억해야 해서(#127) `onClick` 이 필요하고, `page.tsx` 는 async
 * server component 라 그 핸들러를 직접 가질 수 없기 때문이다.
 */
export function SettingsGearLink() {
  return (
    <Link
      href="/settings"
      onClick={() => rememberSettingsReturnTab("ranking")}
      aria-label="설정"
      // 시각 크기는 디자인대로 34×34 를 유지하고 ::after 로 터치 영역만
      // 48×48 로 넓힌다 — `BackButton.tsx:28` 과 같은 방식(07-screens.md:15).
      className="relative mt-2 flex size-[34px] shrink-0 items-center justify-center rounded-xs bg-surface-muted text-subtle after:absolute after:-inset-[7px] after:content-['']"
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
