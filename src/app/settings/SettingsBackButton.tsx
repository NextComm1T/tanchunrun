"use client";

import { useRouter } from "next/navigation";

import { consumeSettingsReturnTab } from "./returnTab";

/**
 * 설정 화면 전용 뒤로가기(#127). 공용 `BackButton` 과 시각은 같지만 history 가 아니라
 * source tab 으로 돌아간다(정본 L1172 closeSettings) — 그래서 공용 컴포넌트를 그대로
 * 쓰지 못하고 이 화면 안에 로컬로 둔다(`docs/ARCHITECTURE.md` "새 화면 만들기" 3단계와
 * 같은 사유 — 필요한 semantics 가 shared API 와 다르면 로컬로 그리고 shared 를 바꾸지 않는다).
 */
export function SettingsBackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="뒤로 가기"
      onClick={() => router.push(consumeSettingsReturnTab())}
      className="relative flex size-10 shrink-0 items-center justify-center rounded-sm bg-surface-muted text-foreground after:absolute after:-inset-1 after:content-['']"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}
