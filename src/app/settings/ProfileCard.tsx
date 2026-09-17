import Link from "next/link";

import { ROW_CLASS, ROW_DIVIDER_CLASS, RowChevron } from "./SettingsRow";
import { SettingsCard, SettingsSection } from "./SettingsSection";

/** 내 정보 줄의 작은 라벨(디자인 L388 `12/700 #8B93A5`). */
function RowLabel({ children }: { children: string }) {
  return <p className="mb-[5px] text-label font-bold text-muted">{children}</p>;
}

/**
 * 「내 정보」 섹션(디자인 L384-401).
 *
 * 두 값 모두 `getViewer()` 가 세션에서 준 실제 값이다(#88). server component 가 기다렸다가
 * 그리므로 **불러오는 중 상태가 없고**, 조회가 실패하면 이 카드가 아니라 화면 전체가
 * 오류로 바뀐다 — 누구인지 모르면 아래 계정 항목도 그릴 수 없기 때문이다.
 *
 * `nickname` 이 `null` 인 것은 조회 실패가 아니라 **계정 상태가 「가입 중」**이라는 뜻이다
 * (`docs/06-data.md:19` · P11). 소셜 인증은 끝났고 닉네임만 아직 없다.
 */
export function ProfileCard({
  nickname,
  providerLabel,
}: {
  nickname: string | null;
  providerLabel: string;
}) {
  return (
    <SettingsSection title="내 정보">
      <SettingsCard>
        <li className={ROW_DIVIDER_CLASS}>
          <Link href="/settings/nickname" className={`${ROW_CLASS} py-[18px]`}>
            <div>
              <RowLabel>닉네임</RowLabel>
              {nickname ? (
                <p className="text-lg font-extrabold text-foreground">
                  {nickname}
                </p>
              ) : (
                <p className="text-lg font-extrabold text-disabled">
                  아직 없어요
                </p>
              )}
            </div>
            <span className="flex shrink-0 items-center gap-1 text-primary">
              <span className="text-content font-extrabold">
                {nickname ? "수정" : "설정"}
              </span>
              <RowChevron />
            </span>
          </Link>
        </li>

        <li className={`${ROW_DIVIDER_CLASS} ${ROW_CLASS} py-[18px]`}>
          <div>
            <RowLabel>로그인 계정</RowLabel>
            <p className="text-lg font-extrabold text-foreground">
              {providerLabel}
            </p>
          </div>
        </li>
      </SettingsCard>
    </SettingsSection>
  );
}
