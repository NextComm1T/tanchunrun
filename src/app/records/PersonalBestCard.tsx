import type { PersonalBest } from "@/server/records";

import {
  formatBestDuration,
  formatDistance,
  formatPace,
  metersToKm,
} from "./format";

type BestItemProps = {
  label: string;
  value: string;
  unit: string;
  /** 가운데 칸만 좌우에 구분선이 있다. */
  divided?: boolean;
};

function BestItem({ label, value, unit, divided = false }: BestItemProps) {
  return (
    <div className="relative min-w-0 px-2.5 py-[18px] text-center">
      {divided ? (
        // 원본(L866)은 배경 그라데이션으로 위아래 14px 를 띄운 1px 선을 그린다.
        <>
          <span
            aria-hidden="true"
            className="absolute top-3.5 bottom-3.5 left-0 w-px bg-surface-muted"
          />
          <span
            aria-hidden="true"
            className="absolute top-3.5 right-0 bottom-3.5 w-px bg-surface-muted"
          />
        </>
      ) : null}
      <dt className="mb-2.5 text-[11.5px] font-bold text-muted">{label}</dt>
      <dd className="text-[23px] leading-none font-extrabold text-primary">
        {value}
      </dd>
      <dd className="mt-1.5 text-[11.5px] font-semibold text-muted">{unit}</dd>
    </div>
  );
}

/**
 * 개인 최고 기록 카드(디자인 L860-876).
 *
 * 값은 계산하지 않고 받은 그대로 형식만 바꾼다 — 파생은 `src/server/records.ts` 가 한다(D6).
 *
 * **기록이 0건이면 세 값이 모두 `null` 이다.** 거리 · 시간은 빈 상태 표기(`0.0` · `0:00:00`)로
 * 떨어뜨리고, 페이스만 `--'--"` 로 둔다 — `formatPace` 가 null 을 그렇게 그린다.
 */
export function PersonalBestCard({ best }: { best: PersonalBest }) {
  return (
    <dl className="grid grid-cols-3 overflow-hidden rounded-xl border-[1.5px] border-border bg-surface shadow-button-soft">
      <BestItem
        label="최장 거리"
        value={formatDistance(metersToKm(best.longestDistanceM ?? 0))}
        unit="km"
      />
      <BestItem
        label="최대 시간"
        value={formatBestDuration(best.longestDurationSec ?? 0)}
        unit="시:분:초"
        divided
      />
      <BestItem
        label="최고 페이스"
        value={formatPace(best.bestPaceSecPerKm)}
        unit="/km"
      />
    </dl>
  );
}
