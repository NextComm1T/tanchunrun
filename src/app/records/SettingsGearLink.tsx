import Link from "next/link";

/**
 * 설정 진입(디자인 L832). 탭이 아니라 각 탭 상단의 기어로 들어간다(`modify/2026-09-14.md` 1번).
 *
 * 기록 탭 상단에서는 제목 위 오른쪽에 온다(`self-end`).
 */
export function SettingsGearLink() {
  return (
    <Link
      href="/settings"
      aria-label="설정"
      // 시각 크기는 디자인대로 34×34 를 유지하고 ::after 로 터치 영역만
      // 48×48 로 넓힌다 — `BackButton.tsx` 와 같은 방식(07-screens.md:15).
      className="relative flex size-[34px] shrink-0 items-center justify-center self-end rounded-xs bg-surface-muted text-subtle after:absolute after:-inset-[7px] after:content-['']"
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
