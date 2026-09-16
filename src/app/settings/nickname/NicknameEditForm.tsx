"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  checkNickname,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
} from "@/domain/nickname";
import { updateNickname } from "@/server/account/actions";

/**
 * 닉네임 수정 — 디자인 L604-618.
 *
 * 규칙은 최초 설정 화면과 **같은 모듈**(`@/domain/nickname`)을 쓴다(P10). 다만 판정 순서가
 * 다르다 — 여기서는 「현재 닉네임과 동일」을 중복보다 먼저 본다. 서버가 본인 닉네임을
 * 중복으로 돌려줘도 "이미 사용 중" 이라고 말하지 않게 하려는 것이다.
 *
 * 중복은 저장을 시도해 봐야 안다(서버 unique 제약) — 입력 중에는 판정하지 않는다.
 */

/**
 * 화면의 상태(`docs/07-screens.md:12`).
 * - 오류 → `invalid`(형식 위반)
 * - 정상 → `unchanged`(바꾼 것이 없음) · `ready`(저장 가능)
 * - 불러오는 중 → 없다(현재 닉네임을 서버 컴포넌트가 이미 갖고 내려 준다).
 */
type Status = "empty" | "invalid" | "unchanged" | "ready";

type Result = { status: Status; message: string | null };

function resolve(draft: string, currentNickname: string): Result {
  switch (checkNickname(draft)) {
    case "empty":
      // 디자인에는 이 문구가 없어 문서(P10) 쪽을 썼다 — #39 와 같은 문구다.
      return { status: "empty", message: "닉네임을 입력해 주세요" };
    case "whitespace":
      return { status: "invalid", message: "공백은 포함할 수 없습니다." };
    case "charset":
      return { status: "invalid", message: "특수문자는 사용할 수 없습니다." };
    case "too_short":
      return {
        status: "invalid",
        message: `${NICKNAME_MIN_LENGTH}자 이상 입력해주세요.`,
      };
    case "too_long":
      // 입력은 maxLength 가 막지만 규칙 자체는 남겨 둔다(디자인 L1266).
      return {
        status: "invalid",
        message: `${NICKNAME_MAX_LENGTH}자 이하로 입력해주세요.`,
      };
    default:
      break;
  }

  if (draft.trim() === currentNickname) {
    return { status: "unchanged", message: "현재 닉네임과 동일합니다." };
  }

  // 디자인의 수정 화면에는 성공 문구가 없다(최초 설정 화면과 다른 점).
  return { status: "ready", message: null };
}

/** 서버가 돌려준 실패 사유의 문구. */
const SAVE_ERROR_MESSAGES = {
  empty: "닉네임을 입력해 주세요",
  format: "닉네임은 2~10자의 한글·영문·숫자만 쓸 수 있습니다.",
  duplicate: "이미 사용 중인 닉네임입니다.",
  unchanged: "현재 닉네임과 동일합니다.",
  failed: "저장에 실패했습니다. 다시 시도해주세요.",
} as const;

type NicknameEditFormProps = {
  /**
   * 현재 저장된 닉네임. **읽기 전용이다.**
   * 입력 중인 값은 이 컴포넌트의 draft state 이고, 검증 실패나 중복 판정이
   * 이 prop 을 바꾸지 않는다 — 저장에 실패해도 기존 닉네임이 유지된다(P10).
   */
  currentNickname: string;
};

export function NicknameEditForm({ currentNickname }: NicknameEditFormProps) {
  const router = useRouter();

  // 들어오면 현재 닉네임이 채워져 있다(디자인 L1173).
  const [draft, setDraft] = useState(currentNickname);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { status, message } = resolve(draft, currentNickname);
  const canSave = status === "ready";

  const shownMessage = saveError ?? message;
  const isError =
    saveError !== null || status === "empty" || status === "invalid";

  function handleSubmit() {
    setSaveError(null);

    startTransition(async () => {
      const result = await updateNickname(draft.trim());

      if (!result.ok) {
        setSaveError(SAVE_ERROR_MESSAGES[result.error]);
        return;
      }

      // 설정 화면이 새 닉네임을 다시 읽도록 서버 컴포넌트를 무효화한 뒤 돌아간다.
      router.replace("/settings");
      router.refresh();
    });
  }

  return (
    <>
      <div className="py-[22px]">
        <div className="rounded-xl border-[1.5px] border-info-border bg-surface px-5 py-[18px] shadow-card">
          <label
            htmlFor="nickname"
            className="mb-2 block text-label font-bold text-muted"
          >
            닉네임
          </label>
          <input
            id="nickname"
            type="text"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setSaveError(null);
            }}
            placeholder="닉네임 입력"
            maxLength={NICKNAME_MAX_LENGTH}
            autoFocus
            aria-describedby="nickname-hint nickname-feedback"
            aria-invalid={isError}
            className="w-full bg-transparent text-title font-bold text-foreground outline-none placeholder:text-disabled"
          />

          <div className="mt-3.5 flex items-center justify-between border-t border-surface-muted pt-3.5">
            <p
              id="nickname-hint"
              className="text-note leading-[1.45] font-medium text-muted"
            >
              다른 러너들에게 표시되는 이름이에요.
            </p>
            <span className="ml-2 shrink-0 text-note font-bold text-muted">
              {draft.length}/{NICKNAME_MAX_LENGTH}
            </span>
          </div>
        </div>

        <p
          id="nickname-feedback"
          role="status"
          className={`mt-2.5 ml-1 text-sm ${
            isError ? "font-semibold text-danger" : "font-medium text-muted"
          }`}
        >
          {shownMessage ?? ""}
        </p>
      </div>

      <div className="mt-auto shrink-0 pb-[34px]">
        <button
          type="button"
          disabled={!canSave || pending}
          onClick={handleSubmit}
          className={`h-[60px] w-full rounded-xl text-[19px] font-extrabold ${
            canSave
              ? "bg-primary text-on-primary disabled:opacity-60"
              : "cursor-not-allowed bg-disabled-surface text-disabled"
          }`}
        >
          저장
        </button>
      </div>
    </>
  );
}
