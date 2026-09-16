import Link from "next/link";

import type { RecordSummary } from "@/server/records";

import {
  formatDate,
  formatDistance,
  formatDuration,
  formatPace,
  metersToKm,
} from "./format";

/** 수치 톤. 클래스명을 조립하지 않도록 완성된 리터럴로 둔다. */
const METRIC_TONE = {
  default: { label: "text-muted", value: "text-foreground", unit: "text-muted" },
  success: { label: "text-success", value: "text-success", unit: "text-success-strong" },
} as const;

type MetricProps = {
  label: string;
  value: string;
  unit?: string;
  tone?: keyof typeof METRIC_TONE;
};

function Metric({ label, value, unit, tone = "default" }: MetricProps) {
  const style = METRIC_TONE[tone];

  return (
    <div className="min-w-0">
      <dt className={`mb-[5px] text-caption font-bold ${style.label}`}>{label}</dt>
      <dd className={`text-lg leading-none font-extrabold ${style.value}`}>
        {value}
        {unit ? (
          <span className={`ml-0.5 text-caption font-semibold ${style.unit}`}>
            {unit}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * 러닝 기록 한 줄(디자인 L883-911). 누르면 기록 상세로 간다(F11).
 *
 * 원본은 `<button onClick>` 이지만 실제 앱에서는 route 이동이라 링크로 둔다
 * (`modify/2026-09-15-bottomnav.md` 2번과 같은 판단).
 */
export function RecordListItem({ session }: { session: RecordSummary }) {
  // 탄천 인정 거리가 0 인 세션만 "탄천 외" 다(원본 L1239).
  const isOutside = session.tancheonDistanceM === 0;

  return (
    <Link
      href={`/records/${session.id}`}
      className="block w-full rounded-2xl border-[1.5px] border-border bg-surface p-[18px] shadow-button-soft"
    >
      <div className="mb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-button font-extrabold text-foreground">
            {formatDate(session.runDate)}
          </span>
          {isOutside ? (
            <span className="rounded-full bg-surface-muted px-[9px] py-[3px] text-caption font-bold text-muted">
              탄천 외
            </span>
          ) : null}
        </div>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0 text-disabled"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>

      <dl className="grid grid-cols-4 gap-2">
        <Metric label="총 거리" value={formatDistance(metersToKm(session.totalDistanceM))} unit="km" />
        <Metric
          label="탄천 인정"
          value={formatDistance(metersToKm(session.tancheonDistanceM))}
          unit="km"
          tone="success"
        />
        <Metric label="시간" value={formatDuration(session.durationSec)} />
        <Metric label="페이스" value={formatPace(session.avgPaceSecPerKm)} />
      </dl>
    </Link>
  );
}
