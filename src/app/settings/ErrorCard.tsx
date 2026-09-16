"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * 조회에 실패했을 때의 카드(#88).
 *
 * 설정 · 동의 · 위치정보 · 탈퇴 네 화면이 같은 모양을 쓴다. 예전에는 화면마다 `?state=error`
 * 를 뗀 주소로 가는 `<Link>` 였는데, 상태가 URL 에 없어진 뒤로는 같은 주소로 가는 링크가
 * 아무것도 다시 부르지 않는다. 그래서 **실제로 다시 조회하는 버튼**으로 바꿨다.
 *
 * 기본 동작은 `router.refresh()` — server component 를 다시 그려 서버 조회를 다시 한다.
 * 조회가 client 에 있는 화면(위치 권한)은 `onRetry` 로 자기 재시도를 넘긴다.
 */
export function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  /** 없으면 server component 를 다시 그린다. */
  onRetry?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRetry() {
    if (onRetry) {
      onRetry();
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <div
      role="alert"
      className="rounded-2xl border-[1.5px] border-error-border bg-error-soft px-5 py-[18px]"
    >
      <p className="text-sm font-bold text-error">{message}</p>
      {/* 높이 48px 은 최소 터치 영역(`docs/07-screens.md:15`). */}
      <button
        type="button"
        onClick={handleRetry}
        disabled={pending}
        className="mt-3 flex h-12 w-full items-center justify-center rounded-lg bg-surface text-base font-extrabold text-foreground disabled:opacity-60"
      >
        다시 시도
      </button>
    </div>
  );
}
