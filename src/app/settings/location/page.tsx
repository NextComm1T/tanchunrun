import { AppShell } from "@/components/shared/AppShell";
import { Header } from "@/components/shared/Header";

import {
  STORED_ITEMS,
  USAGE_PERIOD,
  USAGE_REASONS,
  WITHOUT_PERMISSION,
} from "./content";
import { DotList, InfoCard, InfoParagraph } from "./InfoCard";
import { LocationPermissionPanel } from "./LocationPermissionPanel";

/**
 * 위치정보 화면(#47 · #88) — 디자인 L441-471.
 *
 * 권한 상태는 **브라우저에서 실제로 조회한다**(#88). `?state=` · `?permission=` 으로 상태를
 * 고르던 계약은 없앴다. 서버가 아는 값이 아니라서 조회 · 표시 · 재시도가 전부 client 다.
 *
 * 고지 카드 네 장은 권한과 무관하게 늘 옳은 문구라 server component 로 남는다.
 */
export default function LocationSettingsPage() {
  return (
    // 설정에서 들어오는 서브 화면이라 탭바가 없다. 뒤로 가기 목적지가
    // `/settings` 로 정해져 있어 `backHref` 를 준다(디자인 L441 `onBackToSettings`).
    <AppShell
      header={
        <Header
          showBack
          backHref="/settings"
          title={
            // 디자인 L445-446 — 작은 "설정" 위에 화면 이름이 온다.
            <>
              <span className="mb-0.5 block text-label font-semibold text-muted">
                설정
              </span>
              <span className="block">위치정보</span>
            </>
          }
        />
      }
    >
      <div className="flex flex-col gap-3 py-[22px]">
        <LocationPermissionPanel>
          <InfoCard title="위치정보를 사용하는 이유">
            <DotList items={USAGE_REASONS} />
          </InfoCard>

          <InfoCard title="저장되는 위치정보">
            <DotList items={STORED_ITEMS} />
          </InfoCard>

          <InfoCard title="사용 시점">
            <InfoParagraph>{USAGE_PERIOD}</InfoParagraph>
          </InfoCard>

          <InfoCard title="권한을 허용하지 않을 경우">
            <InfoParagraph>{WITHOUT_PERMISSION}</InfoParagraph>
          </InfoCard>
        </LocationPermissionPanel>
      </div>
    </AppShell>
  );
}
