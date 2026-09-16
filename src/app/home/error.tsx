"use client";

import { AppShell } from "@/components/shared/AppShell";
import { BottomNav } from "@/components/shared/BottomNav";

/**
 * 홈 요약 조회 실패(#87 · `docs/07-screens.md:12`).
 *
 * 홈이 닉네임 · 순위 · 누적을 실제로 조회하게 되면서 실패가 성립한다. 러닝을 시작하려면
 * 홈이 떠야 하므로 오류에서 빠져나갈 길(`reset()`)을 반드시 준다. 랭킹 · 기록 탭의 오류 화면과
 * 같은 모양이다.
 */
export default function HomeError({ reset }: { reset: () => void }) {
  return (
    <AppShell bottom={<BottomNav />}>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p role="alert" className="text-content leading-[1.5] font-bold text-subtle">
          화면을 불러오지 못했습니다.
          <br />
          잠시 후 다시 시도해 주세요.
        </p>

        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-base font-extrabold text-on-primary"
        >
          다시 시도
        </button>
      </div>
    </AppShell>
  );
}
