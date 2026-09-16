import "server-only";

import { and, eq } from "drizzle-orm";

import { checkNickname, NICKNAME_INPUT_LIMIT } from "@/domain/nickname";
import { getDb } from "@/server/db/client";
import { isUniqueViolation } from "@/server/db/errors";
import { users } from "@/server/db/schema";

/**
 * 닉네임 저장(#80 · P10).
 *
 * **규칙은 `src/domain/nickname.ts` 한 곳에 있다.** 화면이 즉시 안내할 때와 서버가 다시
 * 검사할 때가 같은 함수를 쓴다 — 규칙이 두 벌이면 화면은 통과시키는데 서버가 거절한다.
 *
 * **중복은 DB unique 제약으로만 판정한다.** 먼저 SELECT 해서 비어 있는지 보고 INSERT 하면
 * 두 브라우저가 동시에 같은 닉네임을 제출했을 때 둘 다 통과한다.
 */

/** 서버가 돌려주는 실패 사유. 화면이 이 값으로 문구를 고른다. */
export type NicknameSaveError =
  | "empty"
  | "format"
  | "duplicate"
  | "unchanged"
  | "failed";

/**
 * 도메인 사유를 계약상의 오류 코드로 접는다.
 *
 * 화면은 공백 · 특수문자 · 길이를 각각 다른 문구로 보여 주지만 그 구분은 **입력 중 즉시
 * 안내**의 몫이다. 서버 계약은 `empty` 와 `format` 두 가지로 충분하다 — 서버까지 온 형식
 * 오류는 client 검증을 우회한 경우라 세밀한 안내가 필요 없다.
 */
function validate(raw: string): "empty" | "format" | null {
  if (raw.length > NICKNAME_INPUT_LIMIT) return "format";

  const issue = checkNickname(raw);
  if (issue === null) return null;

  return issue === "empty" ? "empty" : "format";
}

/**
 * 최초 닉네임 저장 + 가입 완료 전이(P11).
 *
 * `WHERE account_state = 'signing_up'` 이 조건에 들어 있는 것이 핵심이다. 이미 가입을 마친
 * 계정에 이 함수를 다시 부르면 **0행이 갱신되고** `failed` 가 된다 — 닉네임을 덮어쓰지 않는다.
 * 닉네임 수정은 `updateStoredNickname()` 의 몫이다.
 *
 * 닉네임 · `account_state` · `signed_up_at` 이 **한 UPDATE** 라서 셋이 따로 놀 수 없다.
 */
export async function saveInitialNickname(
  userId: string,
  raw: string,
): Promise<{ ok: true } | { ok: false; error: NicknameSaveError }> {
  const invalid = validate(raw);
  if (invalid) return { ok: false, error: invalid };

  const nickname = raw.trim();

  try {
    const updated = await getDb()
      .update(users)
      .set({
        nickname,
        accountState: "active",
        signedUpAt: new Date(),
      })
      .where(and(eq(users.id, userId), eq(users.accountState, "signing_up")))
      .returning({ id: users.id });

    if (updated.length === 0) return { ok: false, error: "failed" };

    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate" };

    // 닉네임 값을 로그에 남기지 않는다. 조용히 삼키지도 않는다.
    return { ok: false, error: "failed" };
  }
}

/**
 * 닉네임 수정. **가입을 마친 계정만** 바꿀 수 있다.
 *
 * 실패하면 아무것도 쓰지 않으므로 기존 닉네임이 그대로 남는다(P10).
 */
export async function updateStoredNickname(
  userId: string,
  raw: string,
  currentNickname: string | null,
): Promise<{ ok: true } | { ok: false; error: NicknameSaveError }> {
  const invalid = validate(raw);
  if (invalid) return { ok: false, error: invalid };

  const nickname = raw.trim();

  // 대소문자만 바꾸는 것은 실제 변경이다 — 다른 러너에게 보이는 표기가 달라진다.
  // 그래서 `normalizeNickname` 이 아니라 정확한 문자열로 비교한다.
  if (nickname === currentNickname) return { ok: false, error: "unchanged" };

  try {
    const updated = await getDb()
      .update(users)
      .set({ nickname })
      .where(and(eq(users.id, userId), eq(users.accountState, "active")))
      .returning({ id: users.id });

    if (updated.length === 0) return { ok: false, error: "failed" };

    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate" };

    return { ok: false, error: "failed" };
  }
}
