import { AppShell } from "@/components/shared/AppShell";
import { Header } from "@/components/shared/Header";

import { CONSENT_SECTIONS } from "../consentSections";

/**
 * 개인정보 수집·이용 동의 상세(디자인 L136-167).
 *
 * 동의를 받는 화면이 아니라 동의 내용을 읽기만 하는 화면이다 — 체크박스도
 * CTA 도 없다. 동의 자체는 진입 화면인 `/signup/consent`(#37)에서 받는다.
 */
export default function SignupConsentDetailPage() {
  return (
    <AppShell
      header={
        <Header
          showBack
          backHref="/signup/consent"
          title={
            // <h1> 안이라 블록 요소 대신 span 을 쓴다(h1 은 phrasing content 만 받는다).
            <span className="block">
              <span className="mb-0.5 block text-label font-semibold text-muted">
                가입하기
              </span>
              <span className="block text-title font-extrabold">
                개인정보 수집·이용 동의
              </span>
            </span>
          }
        />
      }
    >
      <div className="flex flex-col gap-3 py-[22px]">
        {CONSENT_SECTIONS.map((section) => (
          <section
            key={section.title}
            className="rounded-2xl border-[1.5px] border-border bg-surface px-5 py-[18px] shadow-card"
          >
            <h2 className="mb-2 text-note font-bold text-muted">
              {section.title}
            </h2>
            <p className="text-content leading-[1.65] font-medium">
              {section.body}
            </p>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
