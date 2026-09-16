"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteLocalDataForUser } from "@/client/accountData";
import { withdraw } from "@/server/account/actions";

import { ConfirmDialog } from "../ConfirmDialog";

/**
 * 실패 사유별 문구.
 *
 * `active_session` 은 러닝이 진행 중이라 서버가 막은 경우다(P12). 이 화면이 이미 버튼을
 * 막아 두지만, **화면을 그린 뒤에 다른 기기에서 러닝이 시작될 수 있어서** 여기까지 오는
 * 길이 있다. UI 비활성을 검증으로 치지 않는다.
 */
const WITHDRAW_ERROR_MESSAGES = {
  active_session: "진행 중인 러닝을 먼저 종료해 주세요",
  failed: "탈퇴하지 못했습니다. 잠시 후 다시 시도해주세요.",
} as const;

/**
 * 회원탈퇴 확정 버튼 + 최종 확인 모달 — 디자인 L590(버튼) · L951-965(모달).
 *
 * 모달 컴포넌트는 `../ConfirmDialog` 를 그대로 쓴다 — **같은 모달을 두 벌 만들지 않는다.**
 * Esc · 바깥 클릭 · 포커스 트랩 · 닫은 뒤 트리거로 포커스 복귀는 거기서 온다.
 *
 * **순서가 계약이다**(#88 · D11).
 *   ① `withdraw()` 가 서버 트랜잭션을 커밋하고 쿠키를 지운다
 *   ② 성공을 받은 뒤에야 이 기기 IndexedDB 에서 그 userId 의 durable state 를 지운다
 *   ③ `/login` 으로 옮긴다
 *
 * 실패하면 **아무것도 지우지 않고 이동하지도 않는다.** 모달만 닫고 성공처럼 보이게 하는
 * 것이 이 화면에서 가장 하면 안 되는 일이다(fake success 금지).
 */
export function WithdrawButton({
  userId,
  blocked,
}: {
  userId: string;
  blocked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setOpen(false);
    setError(null);

    startTransition(async () => {
      const result = await withdraw();

      if (!result.ok) {
        setError(WITHDRAW_ERROR_MESSAGES[result.error]);
        return;
      }

      /*
        여기서부터 계정은 이미 없다. 로컬 정리가 실패해도 탈퇴를 되돌릴 수 없고, 남은
        레코드는 사라진 userId 의 것이라 아무도 읽지 못한다(재가입하면 새 UID · P13).
        그래서 실패를 오류로 돌리지 않고 이동을 막지도 않는다 — 여기서 멈추면 사용자가
        지워진 계정으로 설정 화면에 갇힌다.
      */
      await deleteLocalDataForUser(userId).catch(() => undefined);

      // push 가 아니라 replace 라서 뒤로 가기로 탈퇴 화면에 되돌아오지 않는다.
      router.replace("/login");
    });
  }

  const disabled = blocked || pending;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`mt-1.5 h-[58px] w-full rounded-xl text-button font-extrabold ${
          disabled
            ? "cursor-not-allowed bg-disabled-surface text-disabled"
            : "bg-danger text-on-primary shadow-danger"
        }`}
      >
        회원탈퇴
      </button>

      {/*
        탈퇴 실패 안내. 디자인에 없는 요소지만 「실패 시 오류 + 다시 시도」가 요구다.
        로그아웃 실패 안내(`../LogoutRow`)와 같은 토큰을 쓴다.
      */}
      {error ? (
        <p
          role="alert"
          className="rounded-md border-[1.5px] border-error-border bg-error-soft px-4 py-3 text-sm font-bold text-error"
        >
          {error}
        </p>
      ) : null}

      {/* 문구는 디자인 L954-955, 확인 버튼 색은 L958(`#EF6A5E` = danger). */}
      <ConfirmDialog
        open={open}
        title="정말 탈퇴하시겠어요?"
        description="러닝 기록과 저장된 경로 등 계정 데이터가 삭제되며 복구할 수 없습니다."
        confirmLabel="탈퇴하기"
        confirmClassName="bg-danger text-on-primary"
        onConfirm={handleConfirm}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
