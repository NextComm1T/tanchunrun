import Image from "next/image";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shared/AppShell";
import { BottomNav } from "@/components/shared/BottomNav";
import { getViewer } from "@/server/auth/session";
import { getRanking, type RankingEntry } from "@/server/rankingView";

import { SettingsGearLink } from "./SettingsGearLink";

import medalGold from "@assets/medal-1.png";
import medalSilver from "@assets/medal-2.png";
import medalBronze from "@assets/medal-3.png";

/** 1·2·3위만 메달이고 4위부터는 숫자다(디자인 L803-812). */
const MEDALS = [medalGold, medalSilver, medalBronze];

/** 목록이 비었을 때(디자인에 없는 상태 — `modify/2026-09-15-ranking.md` 1번). */
const EMPTY_RANKING_NOTICE = "아직 랭킹 데이터가 없습니다";

/** 거리는 m 로 저장하고 km 소수 한 자리로 보여 준다(디자인 L969-983). */
function toKilometres(distanceM: number): string {
  return (distanceM / 1000).toFixed(1);
}

/** 내 순위 강조 카드(디자인 L784-797). 내가 목록에 없으면 화면이 아예 렌더하지 않는다. */
function MyRankCard({ entry }: { entry: RankingEntry }) {
  return (
    <div className="sticky top-2.5 z-[5] mx-2 mb-3.5 flex items-center gap-4 rounded-2xl bg-primary px-5 py-[18px] text-on-primary shadow-primary">
      <p className="flex shrink-0 items-baseline gap-[3px]">
        <span className="text-hero font-extrabold leading-none">
          {entry.rank}
        </span>
        <span className="text-note font-bold text-on-primary/85">위</span>
      </p>

      <div className="h-[42px] w-px shrink-0 bg-on-primary/30" aria-hidden="true" />

      <p className="min-w-0 flex-1 truncate text-lg font-extrabold">
        {entry.nickname}
      </p>

      <p className="flex shrink-0 items-baseline gap-[3px]">
        <span className="text-[24px] font-extrabold leading-none">
          {toKilometres(entry.distanceM)}
        </span>
        <span className="text-label font-semibold text-on-primary/80">km</span>
      </p>
    </div>
  );
}

/** 순위 한 줄(디자인 L801-822). 다른 사용자의 상세로 들어가는 길은 없다(P5 · SP1). */
function RankingRow({ entry }: { entry: RankingEntry }) {
  const isTop3 = entry.rank <= 3;
  const toneClassName = entry.isMe
    ? "text-primary-strong"
    : "text-foreground";

  return (
    <li
      className={`flex items-center gap-3.5 rounded-xl border-[1.5px] px-[18px] py-[17px] shadow-button-soft ${
        entry.isMe
          ? "border-primary-border bg-primary-soft"
          : "border-border bg-surface"
      }`}
    >
      <div className="flex w-[38px] shrink-0 items-center justify-center">
        {isTop3 ? (
          <Image
            src={MEDALS[entry.rank - 1]}
            alt={`${entry.rank}위`}
            width={42}
            height={50}
            className="object-contain"
          />
        ) : (
          <span className="text-[21px] font-extrabold leading-none text-primary">
            {entry.rank}
          </span>
        )}
      </div>

      <p
        className={`min-w-0 flex-1 truncate font-extrabold leading-[1.1] ${
          isTop3 ? "text-[21px]" : "text-lg"
        } ${toneClassName}`}
      >
        {entry.nickname}
      </p>

      <p className="shrink-0">
        <span
          className={`font-extrabold leading-none ${
            isTop3 ? "text-[23px]" : "text-title"
          } ${toneClassName}`}
        >
          {toKilometres(entry.distanceM)}
        </span>
        <span className="ml-1 text-[12.5px] font-semibold text-muted">km</span>
      </p>
    </li>
  );
}

/**
 * 홈 — 랭킹 탭(#43 · #87 · F5 · P5 · P8).
 *
 * 목록 · 본인 줄 · 인원수가 모두 실제 누적(`save_state = 'saved'` 파생 · D6)에서 나온다.
 * 상태를 흉내내던 `?state=` 쿼리 계약은 없앴다 — 아무도 랭킹에 오르지 않았으면 그대로 빈
 * 상태이고, 내 누적이 0 이면 내 순위 카드가 렌더되지 않는다. 조회가 실패하면 `error.tsx` 가
 * 오류와 「다시 시도」를 맡는다.
 *
 * **여기서 순위를 계산하지 않는다.** 정렬 · 동점 · 0 제외는 서버(`getRanking`)가 끝낸 값을
 * 그대로 그린다 — 결과 화면 스냅샷(#85)과 같은 규칙을 지나야 두 화면이 어긋나지 않는다.
 */
export default async function RankingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const { entries, total } = await getRanking(viewer.userId);
  const myEntry = entries.find((entry) => entry.isMe);

  return (
    <AppShell bottom={<BottomNav />}>
      <div className="flex items-start justify-between pt-0.5 pb-3.5">
        <div>
          <h1 className="text-display font-extrabold tracking-[-0.8px]">
            탄천 랭킹
          </h1>
          <p className="mt-1 text-sm font-medium text-muted">
            누적 거리 기준 · 총 {total}명
          </p>
        </div>

        <SettingsGearLink />
      </div>

      {myEntry ? <MyRankCard entry={myEntry} /> : null}

      {entries.length > 0 ? (
        <ul className="flex flex-col gap-[9px] pb-4">
          {entries.map((entry) => (
            <RankingRow key={entry.nickname} entry={entry} />
          ))}
        </ul>
      ) : (
        <p className="py-16 text-center text-content text-muted">
          {EMPTY_RANKING_NOTICE}
        </p>
      )}
    </AppShell>
  );
}
