import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shared/AppShell";
import { Header } from "@/components/shared/Header";
import { getViewer, type Viewer } from "@/server/auth/session";

import { ErrorCard } from "../ErrorCard";
import { ACTIVE_SESSION_NOTICE, PROVIDER_LABEL } from "../profile";

import { WithdrawButton } from "./WithdrawButton";

/**
 * 회원탈퇴 — 삭제 항목 확인 단계(디자인 L567-594 · F13 · P12 · P13).
 *
 * 로그인 제공자와 진행 중 러닝 여부가 **실제 값**이 됐다(#88). `?session=running` 으로
 * 차단 상태를 흉내내던 계약은 없앴다.
 *
 * 디자인과 문서가 갈리는 지점은 modify/20260914-settings-withdraw.md ·
 * modify/2026-09-16-settings-withdraw.md 에 있다.
 */

/**
 * 탈퇴하면 지워지는 것(06-data.md:58 비기능 절 「회원 탈퇴(F13) 시 삭제 범위」).
 * 디자인 L580 의 목록과 같고, 순서도 그대로 뒀다.
 */
const DELETED_ITEMS = [
  "서비스 사용자 정보",
  "닉네임",
  "개인 러닝 기록",
  "저장된 GPS 이동 경로",
  "탄천 인정 누적 거리",
  "사용자 누적 데이터",
  "랭킹 반영 데이터",
];

export default async function SettingsWithdrawPage() {
  let viewer: Viewer | null;

  try {
    viewer = await getViewer();
  } catch {
    // 누구의 계정을 지우는지 모르면 탈퇴 버튼을 그릴 수 없다.
    return (
      <WithdrawShell>
        <ErrorCard message="계정 정보를 불러오지 못했어요." />
      </WithdrawShell>
    );
  }

  if (!viewer) redirect("/login");

  const blocked = viewer.hasActiveRun;

  return (
    <WithdrawShell>
      <section className="rounded-2xl border-[1.5px] border-border bg-surface px-5 py-[18px] shadow-card">
        <h3 className="mb-2.5 text-note font-bold text-muted">삭제되는 정보</h3>
        <ul className="text-content leading-[1.9] font-medium">
          {DELETED_ITEMS.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      </section>

      {/* P13 — 되살릴 수 없고, 같은 소셜 계정으로 다시 가입해도 복원되지 않는다. */}
      <p className="rounded-2xl border-[1.5px] border-error-border bg-error-soft px-5 py-[18px] text-content leading-[1.7] font-bold text-error">
        삭제된 러닝 기록과 경로는 복구할 수 없습니다.
        <br />
        동일한 소셜 계정으로 다시 가입하더라도 이전 기록은 복원되지 않습니다.
      </p>

      <p className="rounded-2xl border-[1.5px] border-border bg-surface px-5 py-[18px] text-content leading-[1.65] font-medium text-subtle">
        현재 로그인한 {PROVIDER_LABEL[viewer.provider]} 계정의 데이터만
        삭제됩니다.
      </p>

      {/*
        P12 — 진행 중인 러닝이 있으면 탈퇴를 막는다. 디자인에는 이 안내가 없어 문구를
        문서(05-policy.md:25)에서 가져왔다. modify/20260914-settings-withdraw.md 2번.
        화면이 막는 것은 안내이고, 검증은 `withdraw()` 가 서버에서 다시 한다.
      */}
      {blocked ? (
        <p
          role="alert"
          className="rounded-2xl border-[1.5px] border-warning-border bg-warning-soft px-5 py-[18px] text-content leading-[1.7] font-bold text-warning"
        >
          {ACTIVE_SESSION_NOTICE}
        </p>
      ) : null}

      {/*
        확정 버튼과 최종 확인 모달(디자인 L590 · L951-965)은 상호작용이 있어 클라이언트
        조각으로 뺐다. 모달은 `../ConfirmDialog` 를 그대로 쓴다.

        `userId` 를 넘기는 이유는 탈퇴가 성공한 뒤 **이 기기의 IndexedDB** 에서 그 사용자의
        durable state 를 지워야 하기 때문이다(D11 permanent cleanup ④). 서버는 브라우저
        저장소에 닿을 수 없다. 이 값은 세션에서 온 것이고 client 가 보낸 값이 아니며,
        서버 함수는 이 prop 을 신뢰하지 않는다 — `withdraw()` 는 인자를 받지 않는다.
      */}
      <WithdrawButton userId={viewer.userId} blocked={blocked} />
    </WithdrawShell>
  );
}

/** 정상 · 오류가 같은 틀을 쓴다. */
function WithdrawShell({ children }: { children: ReactNode }) {
  return (
    <AppShell
      header={
        <Header
          showBack
          // 취소 = 뒤로 가기다. 아무것도 지우지 않고 설정으로 돌아간다(P13).
          backHref="/settings"
          title={
            <span className="block">
              <span className="mb-0.5 block text-label font-semibold text-muted">
                설정
              </span>
              회원탈퇴
            </span>
          }
        />
      }
    >
      <div className="flex flex-col gap-3 py-[22px]">
        <h2 className="mb-0.5 text-[22px] font-extrabold tracking-[-0.4px]">
          회원탈퇴 전에 확인해주세요.
        </h2>

        {children}
      </div>
    </AppShell>
  );
}
