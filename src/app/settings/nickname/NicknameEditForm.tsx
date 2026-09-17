"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

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

/**
 * 제출 버튼이 입력과 **다른 블록**(화면 바닥 `mt-auto`)에 있어 `form` 속성으로 묶는다(#123).
 * 버튼이 폼의 기본 제출 버튼이 되어, 입력에서의 Enter · Done 도 같은 경로로 들어온다.
 */
const FORM_ID = "settings-nickname-form";

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
  // 한글 IME 가 글자를 조합하는 중인지. Enter 가 "조합 확정"인지 "제출"인지를 가른다.
  const composing = useRef(false);

  const { status, message } = resolve(draft, currentNickname);
  const canSave = status === "ready";

  const shownMessage = saveError ?? message;
  const isError =
    saveError !== null || status === "empty" || status === "invalid";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // 버튼 클릭 · Enter · 모바일 키보드 Done 이 전부 여기로 모인다. 기본 제출은 막는다.
    event.preventDefault();

    /*
      `canSave` 가 false 면 「현재 닉네임과 동일」이거나 형식 위반이다 — 어느 쪽도 저장하지
      않는다. pending 판정을 함께 두어 Enter 연타로 두 번 저장되는 것도 막는다.
    */
    if (!canSave || pending || composing.current) return;

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

  /*
    조합을 끝내는 Enter 는 **확정 키**다. 그대로 두면 "탄천"을 만들려던 Enter 가 "탄ㅊ" 을
    저장해 버린다. 확정만 시키고 제출은 다음 Enter 로 넘긴다.
  */
  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (
      event.key === "Enter" &&
      (event.nativeEvent.isComposing || composing.current)
    ) {
      event.preventDefault();
    }
  }

  return (
    <>
      <div className="py-[22px]">
        <form
          id={FORM_ID}
          onSubmit={handleSubmit}
          className="rounded-xl border-[1.5px] border-info-border bg-surface px-5 py-[18px] shadow-card"
        >
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
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            placeholder="닉네임 입력"
            maxLength={NICKNAME_MAX_LENGTH}
            autoFocus
            // 이 화면의 유일한 입력이고 확정하면 저장이 끝난다 — 키보드 확정 키를 "완료"로.
            enterKeyHint="done"
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
        </form>

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
          type="submit"
          form={FORM_ID}
          disabled={!canSave || pending}
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
