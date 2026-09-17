import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shared/AppShell";
import { BottomNav } from "@/components/shared/BottomNav";
import { getViewer } from "@/server/auth/session";
import { getRanking, type RankingEntry } from "@/server/rankingView";

import medalGold from "@assets/medal-1.png";
import medalSilver from "@assets/medal-2.png";
import medalBronze from "@assets/medal-3.png";

/** 1·2·3위만 메달이고 4위부터는 숫자다(디자인 L803-812). */
const MEDALS = [medalGold, medalSilver, medalBronze];

/** 목록이 비었을 때(디자인에 없는 상태 — `modify/2026-09-15-ranking.md` 1번). */
const EMPTY_RANKING_NOTICE = "아직 랭킹 데이터가 없습니다";

/** 본인이 목록에 없을 때(누적 인정 거리 0)의 안내(#121 · 디자인에 없는 상태). */
const NOT_RANKED_NOTICE = "아직 탄천 Ranking Zone 인정 거리가 없어요";

/** 참여 조건 설명(F5 · P5 — 인정 거리가 0보다 커야 랭킹에 오른다). #121 이 추가한 문구다. */
const PARTICIPATION_HINT =
  "탄천 Ranking Zone 안에서 달리면 인정 거리가 쌓여 랭킹에 올라요";

/** 거리는 m 로 저장하고 km 소수 한 자리로 보여 준다(디자인 L969-983). */
function toKilometres(distanceM: number): string {
  return (distanceM / 1000).toFixed(1);
}

/** 설정 진입(디자인 L779). 탭 화면이라 공용 `Header` 를 쓰지 않는다. */
function SettingsGearLink() {
  return (
    <Link
      href="/settings"
      aria-label="설정"
      // 시각 크기는 디자인대로 34×34 를 유지하고 ::after 로 터치 영역만
      // 48×48 로 넓힌다 — `BackButton.tsx:28` 과 같은 방식(07-screens.md:15).
      className="relative mt-2 flex size-[34px] shrink-0 items-center justify-center rounded-xs bg-surface-muted text-subtle after:absolute after:-inset-[7px] after:content-['']"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    </Link>
  );
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
 * 참여 조건 설명 + `/home` CTA(#121). 빈 랭킹 · 본인 미등재 두 상태가 함께 쓴다 —
 * 둘 다 "왜 안 보이는지" 다음에 "그럼 어떻게 해야 하는지"를 같은 모양으로 답한다.
 *
 * 디자인(`탄천런.dc.html` L772-828)에 없는 상태라 새 컴포넌트를 만들지 않고 기존 카드 ·
 * 버튼 토큰(`InfoCard`·`RunMapCard.tsx` 의 위치정보 설정 링크와 같은 방식)을 그대로 쓴다.
 */
function RankingParticipationNotice({ heading }: { heading: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-border bg-surface px-5 py-8 text-center shadow-card">
      <p className="text-content font-bold text-foreground">{heading}</p>
      <p className="text-sm font-medium text-muted">{PARTICIPATION_HINT}</p>
      <Link
        href="/home"
        className="mt-1 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-base font-extrabold text-on-primary"
      >
        달리러 가기
      </Link>
    </div>
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

      {myEntry ? (
        <MyRankCard entry={myEntry} />
      ) : entries.length > 0 ? (
        <div className="mb-3.5">
          <RankingParticipationNotice heading={NOT_RANKED_NOTICE} />
        </div>
      ) : null}

      {entries.length > 0 ? (
        <ul className="flex flex-col gap-[9px] pb-4">
          {entries.map((entry) => (
            <RankingRow key={entry.nickname} entry={entry} />
          ))}
        </ul>
      ) : (
        <div className="py-10">
          <RankingParticipationNotice heading={EMPTY_RANKING_NOTICE} />
        </div>
      )}
    </AppShell>
  );
}
