import type { RecordTotals } from "@/server/records";

import { formatDistance, metersToKm } from "./format";

/**
 * 카드 톤. 클래스명을 문자열로 조립하면 Tailwind 스캐너가 보지 못하므로 완성된 리터럴로 둔다.
 *
 * 그림자는 둘 다 `shadow-card` 다 — 탄천 카드의 원본(L850)은 불투명도가 0.05 로 0.01 낮지만
 * 토큰을 늘리지 않는다.
 */
const CARD_TONE = {
  default: {
    card: "border-border bg-surface",
    label: "text-muted",
    value: "text-foreground",
    unit: "text-muted",
  },
  success: {
    card: "border-success-border bg-success-soft",
    label: "text-success",
    value: "text-success",
    unit: "text-success-strong",
  },
} as const;

type AccumulatedCardProps = {
  label: string;
  distanceKm: number;
  tone: keyof typeof CARD_TONE;
};

function AccumulatedCard({ label, distanceKm, tone }: AccumulatedCardProps) {
  const style = CARD_TONE[tone];

  return (
    <div
      className={`min-w-0 rounded-2xl border-[1.5px] px-[18px] py-3.5 shadow-card ${style.card}`}
    >
      <p className={`mb-2 text-[12.5px] font-bold ${style.label}`}>{label}</p>
      <p
        className={`text-[40px] leading-none font-extrabold tracking-[-2px] ${style.value}`}
      >
        {formatDistance(distanceKm)}
      </p>
      <p className={`mt-[7px] text-sm leading-[normal] font-semibold ${style.unit}`}>
        km
      </p>
    </div>
  );
}

/** 누적 러닝 두 카드(디자인 L844-855). 기록이 없으면 두 값 모두 `0.0` 이다. */
export function AccumulatedCards({ totals }: { totals: RecordTotals }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <AccumulatedCard
        label="총 누적 거리"
        distanceKm={metersToKm(totals.totalDistanceM)}
        tone="default"
      />
      <AccumulatedCard
        label="탄천 인정 누적"
        distanceKm={metersToKm(totals.tancheonDistanceM)}
        tone="success"
      />
    </div>
  );
}
