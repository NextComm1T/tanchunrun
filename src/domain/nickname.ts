/**
 * 닉네임 규칙(#80 · D4).
 *
 * `src/domain` 은 **프레임워크와 무관한 순수 TS** 다(D12). React · Next · DB · env 를
 * import 하지 않는다 — 그래야 클라이언트 즉시 안내와 서버 재검증이 **같은 함수**를 쓴다.
 * 규칙이 두 벌로 갈리면 화면은 통과시키는데 서버가 거절하는 일이 생긴다.
 *
 * 이 파일은 **사유만 돌려주고 문구 · 판정 순서는 정하지 않는다.** 두 화면의 순서가 실제로
 * 다르기 때문이다 — 가입 화면은 중복을 길이보다 먼저 보고, 수정 화면은 길이를 먼저 본 뒤
 * 「현재 닉네임과 동일」을 중복보다 먼저 본다(본인 닉네임을 "이미 사용 중" 이라고 말하지
 * 않으려는 의도적 배치다). 문구도 두 화면이 다르므로 각 화면이 갖는다.
 */

/** 길이 규칙(디자인 L186 · L1194). 문서는 9자 이하라 `modify/2026-09-14-signup-nickname.md` 1번. */
export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 10;

/**
 * 서버가 받아 줄 입력 길이의 절대 상한.
 *
 * `NICKNAME_MAX_LENGTH` 와 따로 두는 이유 — 10자 초과는 **사용자에게 안내할 형식 오류**지만,
 * 그와 별개로 서버는 애초에 거대한 문자열을 정규식에 태우지 않아야 한다. client 의
 * `maxLength` 는 우회할 수 있으므로 서버가 직접 자른다.
 */
export const NICKNAME_INPUT_LIMIT = 100;

/**
 * 한글·영문·숫자만 허용한다(P10 · 디자인 L1194).
 * `ㄱ-ㅎㅏ-ㅣ` 를 함께 허용해야 자음·모음만으로 된 닉네임이 통과한다.
 */
const DISALLOWED_CHAR = /[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9]/;

export type NicknameIssue =
  | "empty"
  | "whitespace"
  | "charset"
  | "too_short"
  | "too_long";

/**
 * 규칙 위반 사유를 돌려준다. 통과하면 `null`.
 *
 * 공백 검사는 **trim 하기 전 원본**을 본다 — `"가 나"` 처럼 가운데 공백은 trim 으로 사라지지
 * 않고, 앞뒤 공백만 있는 입력은 `empty` 로 먼저 걸린다.
 */
export function checkNickname(raw: string): NicknameIssue | null {
  const nickname = raw.trim();

  if (nickname.length === 0) return "empty";
  if (raw.includes(" ")) return "whitespace";
  if (DISALLOWED_CHAR.test(nickname)) return "charset";
  if (nickname.length < NICKNAME_MIN_LENGTH) return "too_short";
  if (nickname.length > NICKNAME_MAX_LENGTH) return "too_long";

  return null;
}

/**
 * 중복 비교용 정규화. 영문 대소문자를 구분하지 않는다(P10) — `Runner` 와 `runner` 는 같다.
 *
 * DB 의 `lower(nickname)` unique index 와 **같은 값**이 나와야 한다. 그래서 locale 에 따라
 * 결과가 달라지는 `toLocaleLowerCase()` 를 쓰지 않는다.
 */
export function normalizeNickname(raw: string): string {
  return raw.trim().toLowerCase();
}
