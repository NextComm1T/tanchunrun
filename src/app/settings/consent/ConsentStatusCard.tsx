import {
  CONSENT_ITEM_LABEL,
  CONSENT_STATUS_LABEL,
  CONSENT_STATUS_TONE,
  type ConsentStatus,
} from "./content";

/**
 * 동의 상태 배너(디자인 L543-546).
 *
 * 값은 `consents` 테이블에서 온다(#80 · #88). server component 가 기다렸다가 그리므로
 * **불러오는 중 상태가 없고**, 조회가 실패하면 이 배너 대신 오류 카드가 그 자리에 온다.
 *
 * **읽기 전용이다** — 여기서 동의를 철회하거나 바꿀 수 없다(#88 제외 범위).
 */
export function ConsentStatusCard({ status }: { status: ConsentStatus }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border-[1.5px] border-primary-border bg-primary-soft px-5 py-4">
      <span className="text-base font-extrabold text-primary-strong">
        {CONSENT_ITEM_LABEL}
      </span>

      <span
        className={`shrink-0 text-sm font-extrabold ${CONSENT_STATUS_TONE[status]}`}
      >
        {CONSENT_STATUS_LABEL[status]}
      </span>
    </div>
  );
}
