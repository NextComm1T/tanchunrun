/**
 * 내 탄천 순위 카드(디자인 L755-770 · #87).
 *
 * 지도 카드와 한 덩어리로 이어져서 위 모서리를 둥글리지 않는다.
 * 순위와 누적 거리는 탄천 Ranking Zone 안에서 달린 것만 센다(R11 · F1).
 *
 * 값은 `/ranking` 과 같은 조회에서 온다(`src/server/rankingView.ts`) — 이 카드가 따로
 * 계산하지 않으므로 랭킹 화면의 본인 줄과 다른 값이 나올 수 없다.
 */
export function MyRankCard({
  rank,
  total,
  tancheonDistanceM,
}: {
  /** 랭킹에 올라 있지 않으면 `null` — 누적 인정 거리가 0 인 사용자다(P5). */
  rank: number | null;
  total: number;
  tancheonDistanceM: number;
}) {
  return (
    <section className="flex shrink-0 items-stretch justify-between gap-4 rounded-b-2xl border-[1.5px] border-border bg-surface px-5 py-3.5 shadow-card">
      <div>
        <h2 className="mb-1.5 text-label font-bold text-muted">내 탄천 순위</h2>
        <p className="flex items-baseline gap-1.5">
          {/*
            순위가 없는 상태는 정본 디자인에 없다(늘 5위로 차 있다 · L760-768).
            새 문구 · 새 레이아웃을 만들지 않고 숫자 자리만 「-」로 둔다.
            `modify/2026-09-16-ranking-home.md` 2번.
          */}
          <span className="text-[46px] leading-none font-extrabold tracking-[-2px] text-primary">
            {rank === null ? "-" : `${rank}위`}
          </span>
          <span className="text-content font-semibold text-muted">/ {total}명</span>
        </p>
      </div>

      <div className="flex flex-col justify-between text-right">
        <h2 className="mb-1.5 text-label font-bold text-muted">탄천 누적</h2>
        <p className="flex items-baseline justify-end gap-[3px]">
          <span className="text-metric leading-none font-extrabold tracking-[-1px]">
            {(tancheonDistanceM / 1000).toFixed(1)}
          </span>
          <span className="text-label font-semibold text-muted">km</span>
        </p>
      </div>
    </section>
  );
}
