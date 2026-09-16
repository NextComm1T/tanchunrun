"use client";

import { AppShell } from "@/components/shared/AppShell";
import { BottomNav } from "@/components/shared/BottomNav";

/**
 * 랭킹 조회 실패(#87 · `docs/07-screens.md:12`).
 *
 * 실제 집계 조회가 붙어서 **실패가 성립한다** — 상태를 흉내내던 `?state=` 쿼리를 없앤 자리에
 * 진짜 오류 경로가 들어온다. 오류만 보이고 끝나지 않도록 다음 행동(`reset()`)을 준다.
 *
 * `error` 값을 화면에 그리지 않는다. 메시지에 UID 같은 것이 섞여 나올 수 있고, 사용자가 할 수
 * 있는 일은 다시 시도뿐이다(SP1). 기록 탭(`records/error.tsx`)과 같은 모양이다.
 */
export default function RankingError({ reset }: { reset: () => void }) {
  return (
    <AppShell bottom={<BottomNav />}>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p role="alert" className="text-content leading-[1.5] font-bold text-subtle">
          랭킹을 불러오지 못했습니다.
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
