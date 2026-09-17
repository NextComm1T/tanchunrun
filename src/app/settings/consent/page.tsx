import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shared/AppShell";
import { Header } from "@/components/shared/Header";
import { hasCurrentConsent } from "@/server/account/consent";
import { getViewer, type Viewer } from "@/server/auth/session";

import { ErrorCard } from "../ErrorCard";

import { ConsentStatusCard } from "./ConsentStatusCard";
import {
  COLLECTED_ITEMS,
  COLLECTION_PURPOSES,
  REFUSAL_RIGHT,
  RETENTION_PERIOD,
  type ConsentStatus,
} from "./content";
import { DotList, InfoCard, InfoParagraph } from "./InfoCard";

/**
 * 개인정보 수집·이용 동의(보기) — 디자인 L534-562.
 *
 * 동의 상태는 `consents` 테이블의 **실제 값**이다(#88). `?state=` 로 상태를 고르던 계약은 없앴다.
 *
 * `hasCurrentConsent()` 는 **현재 버전**(D5)까지 같은 행을 본다. 고지 문구가 바뀌어 버전이
 * 올라가면 옛 버전에만 동의한 계정은 「확인 불가」가 된다 — 지금 화면에 보이는 문구에 대한
 * 동의 기록이 실제로 없기 때문이고, 「동의 완료」로 적으면 읽지 않은 문구를 확인해 준 셈이 된다.
 *
 * `redirect()` 를 `try` 밖에 두는 것이 중요하다. Next 의 `redirect()` 는 예외로 동작해서
 * `try` 안에 있으면 `catch` 가 삼키고, 로그아웃한 사용자가 `/login` 대신 오류 화면을 보게 된다.
 */
export default async function ConsentSettingsPage() {
  let viewer: Viewer | null;

  try {
    viewer = await getViewer();
  } catch {
    return (
      <ConsentShell>
        <ErrorCard message="동의 상태를 불러오지 못했어요." />
      </ConsentShell>
    );
  }

  if (!viewer) redirect("/login");

  let status: ConsentStatus;

  try {
    status = (await hasCurrentConsent(viewer.userId)) ? "agreed" : "unknown";
  } catch {
    return (
      <ConsentShell>
        <ErrorCard message="동의 상태를 불러오지 못했어요." />
      </ConsentShell>
    );
  }

  return (
    <ConsentShell>
      <ConsentStatusCard status={status} />
    </ConsentShell>
  );
}

/** 정상 · 오류가 같은 틀을 쓴다. 고지 카드는 동의 여부와 무관하게 늘 옳으므로 양쪽에 다 있다. */
function ConsentShell({ children }: { children: ReactNode }) {
  return (
    // 설정에서 들어오는 서브 화면이라 탭바가 없다. 뒤로 가기 목적지가
    // `/settings` 로 정해져 있어 `backHref` 를 준다(디자인 L534 `onBackToSettings`).
    <AppShell
      header={
        <Header
          showBack
          backHref="/settings"
          title={
            // 디자인 L538-539 — 작은 "설정" 위에 화면 이름이 온다.
            <>
              <span className="mb-0.5 block text-label font-semibold text-muted">
                설정
              </span>
              <span className="block">개인정보 수집·이용 동의</span>
            </>
          }
        />
      }
    >
      <div className="flex flex-col gap-3 py-[22px]">
        {children}

        <InfoCard title="수집·이용 목적">
          <DotList items={COLLECTION_PURPOSES} />
        </InfoCard>

        <InfoCard title="수집·이용 항목">
          <DotList items={COLLECTED_ITEMS} />
        </InfoCard>

        <InfoCard title="보유 및 이용기간">
          <InfoParagraph>{RETENTION_PERIOD}</InfoParagraph>
        </InfoCard>

        <InfoCard title="동의 거부 권리 및 제한">
          <InfoParagraph>{REFUSAL_RIGHT}</InfoParagraph>
        </InfoCard>
      </div>
    </AppShell>
  );
}
