import { formatDistance, formatPace } from "./format";

/**
 * 러닝 중 숫자 3개 — 총 거리 · 탄천 인정 · 현재 페이스(디자인 L263-287).
 *
 * 상단의 러닝 시간까지 합쳐 크게 보이는 숫자가 정확히 4개다. 한 화면에 4개까지가
 * 상한이다(`docs/07-screens.md:15`).
 */

type RunStatsProps = {
  totalDistanceKm: number;
  tancheonDistanceKm: number;
  paceSecPerKm: number | null;
  /** 탄천 인정 숫자를 성공 색으로 강조할지 — 구역 안에서 신호가 정상일 때만이다. */
  tancheonHighlighted: boolean;
};

function StatCell({
  label,
  labelClassName = "text-muted",
  value,
  unit,
  toneClassName = "text-foreground",
  divided = false,
}: {
  label: string;
  labelClassName?: string;
  value: string;
  unit: string;
  toneClassName?: string;
  divided?: boolean;
}) {
  return (
    <div className={`px-3 py-4 ${divided ? "border-r border-surface-muted" : ""}`}>
      <p className={`mb-1.5 text-caption font-bold ${labelClassName}`}>{label}</p>
      <p
        className={`text-[28px] leading-none font-extrabold tracking-[-1px] ${toneClassName}`}
      >
        {value}
      </p>
      <p className={`mt-[5px] text-label font-semibold ${toneClassName}`}>{unit}</p>
    </div>
  );
}

export function RunStats({
  totalDistanceKm,
  tancheonDistanceKm,
  paceSecPerKm,
  tancheonHighlighted,
}: RunStatsProps) {
  // 조립한 클래스명은 Tailwind 스캐너가 못 본다. 완성된 리터럴로만 고른다.
  const tancheonTone = tancheonHighlighted ? "text-success" : "text-foreground";

  return (
    <div className="mx-4 mt-3 shrink-0 overflow-hidden rounded-2xl border-[1.5px] border-border bg-surface shadow-card">
      <div className="grid grid-cols-3">
        <StatCell
          label="총 거리"
          value={formatDistance(totalDistanceKm)}
          unit="km"
          divided
        />
        <StatCell
          label="탄천 인정"
          labelClassName="text-success"
          value={formatDistance(tancheonDistanceKm)}
          unit="km"
          toneClassName={tancheonTone}
          divided
        />
        <StatCell
          label="현재 페이스"
          value={formatPace(paceSecPerKm)}
          unit="/km"
        />
      </div>
    </div>
  );
}
