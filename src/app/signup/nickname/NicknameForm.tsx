"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  checkNickname,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
} from "@/domain/nickname";
import { setInitialNickname } from "@/server/account/actions";

/**
 * 닉네임 설정 — 디자인 L179-197.
 *
 * 규칙은 `@/domain/nickname` 하나를 쓴다. **서버가 같은 함수로 다시 검사한다** — 화면 검증은
 * 즉시 안내일 뿐이고 실제 판정은 서버다(`docs/05-policy.md:23` P10).
 *
 * **중복은 화면이 미리 알 수 없다.** 예전에는 사용 중인 닉네임 목록을 화면에 박아 두고
 * 입력 중에 판정했지만, 그건 저장소가 없던 때의 임시 방편이었다. 이제 중복은 저장을
 * 시도해 봐야 알 수 있고 — 그래야 두 사람이 동시에 같은 닉네임을 제출했을 때 한쪽만
 * 통과한다 — 서버 응답으로만 안내한다(`modify/2026-09-16-signup-backend.md` 1번).
 */

type Feedback = { text: string; tone: "error" | "success" };

/**
 * 입력 중 즉시 보여 줄 안내(디자인 L1196-1202).
 * 아직 한 번도 입력하지 않았으면 `null` — 처음부터 오류를 띄우지 않는다.
 */
function validate(raw: string | null): Feedback | null {
  if (raw === null) return null;

  switch (checkNickname(raw)) {
    case "empty":
      // 디자인에는 이 문구가 없어 문서(P10) 쪽을 썼다.
      return { text: "닉네임을 입력해 주세요", tone: "error" };
    case "whitespace":
      return { text: "공백은 포함할 수 없습니다.", tone: "error" };
    case "charset":
      return { text: "특수문자는 사용할 수 없습니다.", tone: "error" };
    case "too_short":
      return { text: `${NICKNAME_MIN_LENGTH}자 이상 입력해주세요.`, tone: "error" };
    case "too_long":
      return { text: `${NICKNAME_MAX_LENGTH}자 이하로 입력해주세요.`, tone: "error" };
    default:
      return { text: "사용할 수 있는 닉네임입니다.", tone: "success" };
  }
}

/** 서버가 돌려준 실패 사유의 문구. 중복과 저장 실패는 제출해 봐야 알 수 있다. */
const SAVE_ERROR_MESSAGES = {
  empty: "닉네임을 입력해 주세요",
  format: "닉네임은 2~10자의 한글·영문·숫자만 쓸 수 있습니다.",
  duplicate: "이미 사용 중인 닉네임입니다.",
  unchanged: "저장에 실패했습니다. 다시 시도해주세요.",
  failed: "저장에 실패했습니다. 다시 시도해주세요.",
} as const;

export function NicknameForm() {
  const router = useRouter();

  // null 은 "아직 입력하지 않음". 지웠을 때의 미입력 안내와 구분하려고 쓴다.
  const [value, setValue] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nickname = value ?? "";

  const feedback = validate(value);
  const isValid = feedback?.tone === "success";

  /**
   * 저장에 성공했을 때만 러닝 시작 화면으로 간다. 실패하면 이 화면에 머무른다 —
   * 가입이 끝나지 않았는데 끝난 것처럼 보이면 안 된다.
   */
  function handleSubmit() {
    setSaveError(null);

    startTransition(async () => {
      const result = await setInitialNickname(nickname.trim());

      if (!result.ok) {
        setSaveError(SAVE_ERROR_MESSAGES[result.error]);
        return;
      }

      // 가입이 끝났으니 뒤로 가기로 닉네임 화면에 돌아오지 않게 replace 를 쓴다.
      router.replace("/home");
    });
  }

  // 서버가 거절한 이유가 있으면 그것을 보여 준다 — 입력이 바뀌면 다시 즉시 안내로 돌아간다.
  const shown: Feedback | null = saveError
    ? { text: saveError, tone: "error" }
    : feedback;

  return (
    <>
      {/* 그림자는 디자인이 alpha 0.05, 토큰(shadow-card)은 0.06 이다. */}
      <div className="rounded-xl border-[1.5px] border-info-border bg-surface px-5 py-[18px] shadow-card">
        <input
          type="text"
          value={nickname}
          onChange={(event) => {
            setValue(event.target.value);
            setSaveError(null);
          }}
          placeholder="닉네임 입력"
          maxLength={NICKNAME_MAX_LENGTH}
          autoFocus
          aria-label="닉네임"
          aria-describedby="nickname-rule nickname-feedback"
          aria-invalid={shown?.tone === "error"}
          className="w-full bg-transparent text-[21px] font-bold text-foreground outline-none placeholder:text-disabled"
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between px-1">
        <span id="nickname-rule" className="text-note font-medium text-muted">
          {NICKNAME_MIN_LENGTH}~{NICKNAME_MAX_LENGTH}자, 공백 · 특수문자 불가
        </span>
        <span className="text-note font-bold text-muted">
          {nickname.length}/{NICKNAME_MAX_LENGTH}
        </span>
      </div>

      <p
        id="nickname-feedback"
        role="status"
        className={`mx-1 mt-2.5 text-sm font-semibold ${
          shown?.tone === "success" ? "text-success" : "text-danger"
        }`}
      >
        {shown?.text ?? ""}
      </p>

      <div className="mt-auto shrink-0 pt-5 pb-[34px]">
        <button
          type="button"
          disabled={!isValid || pending}
          onClick={handleSubmit}
          className={`h-[60px] w-full rounded-xl text-[19px] font-extrabold ${
            isValid
              ? "bg-primary text-on-primary disabled:opacity-60"
              : "cursor-not-allowed bg-disabled-surface text-disabled"
          }`}
        >
          시작하기
        </button>
      </div>
    </>
  );
}
