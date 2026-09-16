import { redirect } from "next/navigation";

import { AppShell } from "@/components/shared/AppShell";
import { Header } from "@/components/shared/Header";
import { getViewer } from "@/server/auth/session";

import { LogoutRow } from "./LogoutRow";
import {
  ACTIVE_SESSION_NOTICE,
  LOCATION_STATUS_LABEL,
  LOCATION_STATUS_TONE,
  MOCK_PROFILE,
  type LocationStatus,
  type SettingsState,
} from "./mock";
import { ProfileCard } from "./ProfileCard";
import { SettingsBlockedRow, SettingsLinkRow } from "./SettingsRow";
import { SettingsCard, SettingsSection } from "./SettingsSection";

/**
 * P12 안내 문구의 id. 막힌 줄들이 `aria-describedby` 로 가리킨다.
 * 한 화면에 하나뿐이라 `useId` 대신 고정값을 쓴다(서버 컴포넌트라 훅도 못 쓴다).
 */
const SESSION_BLOCK_NOTE_ID = "settings-session-block";

/**
 * 서버가 없어서 네 상태를 실제로 만들 수 없다. `/login?error=cancelled` 가
 * 이미 쓰는 방식 그대로 URL 쿼리로 상태를 고른다 — 리뷰어가 코드를 고치지 않고
 * 눈으로 확인할 수 있고, 나중에 서버가 붙으면 이 자리가 조회 결과로 바뀐다.
 * 모르는 값은 정상으로 묶어 원인 코드를 화면에 그대로 보이지 않는다.
 */
function resolveState(raw: string | string[] | undefined): SettingsState {
  const value = Array.isArray(raw) ? raw[0] : raw;

  return value === "loading" || value === "empty" || value === "error"
    ? value
    : "ready";
}

/** 위치 권한은 실제로는 브라우저 권한 조회다 — 그건 #47 의 몫이라 여기선 쿼리로 둔다. */
function resolveLocationStatus(
  raw: string | string[] | undefined,
): LocationStatus {
  const value = Array.isArray(raw) ? raw[0] : raw;

  return value === "denied" ? "denied" : "granted";
}

/*
  진행 중인 러닝은 더 이상 쿼리로 흉내내지 않는다 — 서버가 `getViewer().hasActiveRun` 으로
  실제 세션을 본다(#81 · P12). 로그아웃 차단도 화면이 아니라 `signOut()` 이 서버에서 한다.
*/

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const { state, location: locationParam } = await searchParams;

  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const viewState = resolveState(state);
  const locationStatus = resolveLocationStatus(locationParam);
  const blocked = viewer.hasActiveRun;

  const profile = {
    ...MOCK_PROFILE,
    locationStatus,
    // 빈 상태 = 계정 상태 "가입 중"(닉네임 미설정 · P11).
    nickname: viewState === "empty" ? null : MOCK_PROFILE.nickname,
  };

  return (
    // 탭바가 없는 서브 화면이다. 홈 헤더의 기어로 들어오고 뒤로 가기로 나간다
    // (디자인 L1171-1172 · `modify/2026-09-14.md` 1번).
    // `backHref` 를 주지 않아 `router.back()` 으로 왔던 탭에 그대로 돌아간다 —
    // `/` 는 지금 `/login` 으로 redirect 하므로 `backHref="/"` 는 쓸 수 없다.
    <AppShell header={<Header title="설정" showBack />}>
      <div className="py-[22px]">
        <ProfileCard state={viewState} profile={profile} />

        <SettingsSection title="개인정보 및 권한">
          <SettingsCard>
            <SettingsLinkRow
              href="/settings/location"
              label="위치정보"
              trailing={
                <span className="text-sm font-bold">
                  {LOCATION_STATUS_LABEL[locationStatus]}
                </span>
              }
              trailingClassName={LOCATION_STATUS_TONE[locationStatus]}
            />
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
              모달은 그 화면의 최종 확인 단계라 이슈 #50 의 몫이다.
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
      </div>
    </AppShell>
  );
}
