import { redirect } from "next/navigation";

import { AppShell } from "@/components/shared/AppShell";
import { BottomNav } from "@/components/shared/BottomNav";
import { getViewer } from "@/server/auth/session";
import {
  getPersonalBest,
  getRecordTotals,
  listRecords,
} from "@/server/records";

import { AccumulatedCards } from "./AccumulatedCards";
import { PersonalBestCard } from "./PersonalBestCard";
import { RecordListItem } from "./RecordListItem";
import { RecordSection } from "./RecordSection";
import { SettingsGearLink } from "./SettingsGearLink";

/** 기록 0건 안내(F7 예외). 디자인에 빈 상태가 없어 문구는 문서를 따른다. */
const EMPTY_RECORDS_NOTICE = "아직 기록이 없습니다";

/**
 * 기록 탭(#44 · #86 · F7 · R23).
 *
 * `?state=empty` 로 빈 상태를 흉내내던 쿼리 계약은 없앴다 — 실제 조회가 붙었으므로 기록이
 * 0건이면 그대로 빈 상태가 된다. 조회가 실패하면 `error.tsx` 가 오류와 「다시 시도」를 맡는다.
 *
 * 세 조회를 함께 기다린다. 서로를 필요로 하지 않아 순서대로 부를 이유가 없다.
 */
export default async function RecordsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const [sessions, totals, personalBest] = await Promise.all([
    listRecords(viewer.userId),
    getRecordTotals(viewer.userId),
    getPersonalBest(viewer.userId),
  ]);

  return (
    // 탭 화면이라 공용 `Header` 를 쓰지 않는다 — 기어가 제목 위 오른쪽에 있는 전용 상단이다(L831-839).
    <AppShell bottom={<BottomNav />}>
      {/*
        정본은 행간을 지정하지 않아 브라우저 기본값(normal)이다. 페이지 기본 1.5 를 상속하면
        글줄마다 높이가 커져 화면 전체가 밀리므로 두 블록에서 normal 로 되돌린다.
        자체 행간이 있는 `text-sm` 은 따로 지정한다. 숫자처럼 원본이 1 인 곳은 `leading-none` 이 이긴다.
      */}
      <div className="flex flex-col gap-2.5 py-4 leading-[normal]">
        <SettingsGearLink />
        <div>
          <h1 className="text-display font-extrabold tracking-[-0.8px]">
            내 기록
          </h1>
          <p className="mt-1 text-sm leading-[normal] font-medium text-muted">
            개인 최고 기록 및 러닝 히스토리
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-[22px] pb-6 leading-[normal]">
        <RecordSection title="누적 러닝">
          <AccumulatedCards totals={totals} />
        </RecordSection>

        <RecordSection title="개인 최고 기록">
          <PersonalBestCard best={personalBest} />
        </RecordSection>

        <RecordSection title="러닝 기록">
          {sessions.length > 0 ? (
            <ul className="flex flex-col gap-2.5">
              {sessions.map((session) => (
                <li key={session.id}>
                  <RecordListItem session={session} />
                </li>
              ))}
            </ul>
          ) : (
            // 디자인에 빈 상태가 없다. 랭킹 탭(#43)의 빈 상태와 같은 모양으로 둔다.
            <p className="py-16 text-center text-content text-muted">
              {EMPTY_RECORDS_NOTICE}
            </p>
          )}
        </RecordSection>
      </div>
    </AppShell>
  );
}
