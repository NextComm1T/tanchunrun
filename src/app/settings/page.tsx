import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shared/AppShell";
import { getViewer, type Viewer } from "@/server/auth/session";

import { ErrorCard } from "./ErrorCard";
import { LocationSettingsRow } from "./LocationSettingsRow";
import { LogoutRow } from "./LogoutRow";
import { ACTIVE_SESSION_NOTICE, PROVIDER_LABEL } from "./profile";
import { ProfileCard } from "./ProfileCard";
import { SettingsBlockedRow, SettingsLinkRow } from "./SettingsRow";
import { SettingsCard, SettingsSection } from "./SettingsSection";
import { SettingsHeader } from "./SettingsHeader";

/**
 * 설정 화면(#46 · #88) — 디자인 L375-437.
 *
 * 값은 전부 실제다 — 닉네임 · 로그인 제공자 · 진행 중 러닝 여부는 `getViewer()` 가 세션에서
 * 주고, 위치 권한은 브라우저가 준다(`LocationSettingsRow`). `?state=` · `?location=` ·
 * `?session=` 으로 상태를 고르던 계약은 전부 없앴다.
 *
 * **「불러오는 중」이 이 화면에 없는 이유** — 서버 값은 server component 가 기다렸다가 그리므로
 * 화면에 로딩 자리가 생기지 않는다. 진짜로 기다리는 값은 브라우저 권한 하나뿐이고 그 줄이
 * 자기 스켈레톤을 갖는다. 가짜 로딩을 만들지 않는다.
 */

/** P12 안내 문구의 id. 막힌 줄들이 `aria-describedby` 로 가리킨다. */
const SESSION_BLOCK_NOTE_ID = "settings-session-block";

export default async function SettingsPage() {
  let viewer: Viewer | null;

  try {
    viewer = await getViewer();
  } catch {
    // DB 가 죽은 경우다. 누구인지 모르면 계정 항목을 그릴 수 없으므로 화면 전체가 오류다.
    return (
      <SettingsShell>
        <ErrorCard message="계정 정보를 불러오지 못했어요." />
      </SettingsShell>
    );
  }

  if (!viewer) redirect("/login");

  const blocked = viewer.hasActiveRun;

  return (
    <SettingsShell>
      <ProfileCard
        nickname={viewer.nickname}
        providerLabel={PROVIDER_LABEL[viewer.provider]}
      />

      <SettingsSection title="개인정보 및 권한">
        <SettingsCard>
          <LocationSettingsRow />
          <SettingsLinkRow href="/privacy-policy" label="개인정보처리방침" />
          <SettingsLinkRow
            href="/settings/consent"
            label="개인정보 수집·이용 동의"
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="계정">
        <SettingsCard>
          {blocked ? (
            <li className="bg-warning-soft px-5 py-3.5">
              <p
                id={SESSION_BLOCK_NOTE_ID}
                className="text-sm font-bold text-warning"
              >
                {ACTIVE_SESSION_NOTICE}
              </p>
            </li>
          ) : null}

          {blocked ? (
            <SettingsBlockedRow
              label="로그아웃"
              describedBy={SESSION_BLOCK_NOTE_ID}
            />
          ) : (
            <LogoutRow />
          )}

          {/*
            회원탈퇴는 확인 모달이 아니라 안내 화면으로 간다(디자인 L1322).
            모달은 그 화면의 최종 확인 단계다.
          */}
          {blocked ? (
            <SettingsBlockedRow
              label="회원탈퇴"
              labelClassName="text-danger"
              describedBy={SESSION_BLOCK_NOTE_ID}
            />
          ) : (
            <SettingsLinkRow
              href="/settings/withdraw"
              label="회원탈퇴"
              labelClassName="text-danger"
              trailingClassName="text-danger-soft"
            />
          )}
        </SettingsCard>
      </SettingsSection>
    </SettingsShell>
  );
}

/**
 * 정상 · 오류가 같은 틀을 쓴다.
 *
 * 탭바가 없는 서브 화면이다. 각 탭 상단 기어로 들어오고 뒤로 가기로 나간다
 * (디자인 L1171-1172 · `modify/2026-09-14.md` 1번). 뒤로가기는 history 가 아니라
 * 들어올 때 기억해 둔 source tab 으로 돌아간다(#127 · `SettingsHeader` · `returnTab.ts`).
 */
function SettingsShell({ children }: { children: ReactNode }) {
  return (
    <AppShell header={<SettingsHeader />}>
      <div className="py-[22px]">{children}</div>
    </AppShell>
  );
}
