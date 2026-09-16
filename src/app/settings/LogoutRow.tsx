"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { signOut } from "@/server/auth/actions";

import { ConfirmDialog } from "./ConfirmDialog";
import { ROW_CLASS, ROW_DIVIDER_CLASS, RowChevron } from "./SettingsRow";

/**
 * 「계정」 섹션의 로그아웃 줄(디자인 L425) + 확인 모달(L938-950).
 *
 * 이 화면에서 상호작용이 필요한 유일한 조각이라 여기만 클라이언트 컴포넌트다.
 * 진행 중인 러닝이 있어 막힌 경우(P12)에는 이 줄 대신 서버가 그린
 * `SettingsBlockedRow` 가 들어가므로, 막힌 상태에서는 JS 가 아예 실리지 않는다.
 */
export function LogoutRow() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setOpen(false);
    setFailed(false);

    startTransition(async () => {
      const result = await signOut();

      if (!result.ok) {
        // 세션이 그대로 살아 있다. 이동하면 로그아웃된 것처럼 보이는 가짜 성공이 된다.
        setFailed(true);
        return;
      }

      // push 가 아니라 replace 라서 뒤로 가기로 설정 화면에 되돌아오지 않는다.
      router.replace("/login");
    });
  }

  return (
    <li className={ROW_DIVIDER_CLASS}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className={`${ROW_CLASS} py-[17px] disabled:opacity-60`}
      >
        <span className="text-base font-bold text-foreground">로그아웃</span>
        <span className="flex shrink-0 items-center text-disabled">
          <RowChevron />
        </span>
      </button>

      {/*
        로그아웃 실패 안내. 디자인에 없는 요소지만 #79 가 「실패 시 오류 표시 · 로그인 유지」를
        요구한다(`modify/2026-09-16-auth.md` 5번). 로그인 화면의 실패 안내와 같은 토큰을 쓴다.
      */}
      {failed ? (
        <p
          role="alert"
          className="mx-5 mb-4 rounded-md border-[1.5px] border-error-border bg-error-soft px-4 py-3 text-sm font-bold text-error"
        >
          로그아웃하지 못했습니다. 잠시 후 다시 시도해주세요.
        </p>
      ) : null}

      <ConfirmDialog
        open={open}
        title="로그아웃하시겠어요?"
        description="로그아웃해도 러닝 기록과 계정 데이터는 삭제되지 않습니다."
        confirmLabel="로그아웃"
        onConfirm={handleConfirm}
        onClose={() => setOpen(false)}
      />
    </li>
  );
}
