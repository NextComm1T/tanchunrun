import "server-only";

/**
 * DB 오류 판별.
 *
 * `pg` 는 서버가 보낸 SQLSTATE 를 `error.code` 에 문자열로 담아 준다. drizzle 은 그 오류를
 * 그대로 던지므로 코드로 구분할 수 있다.
 */

/**
 * PostgreSQL `unique_violation`.
 *
 * **중복을 이 오류로 판정하는 것이 중요하다.** 먼저 SELECT 해서 "있나?" 를 본 뒤 INSERT 하면
 * 두 요청이 동시에 들어왔을 때 둘 다 "없음" 을 보고 둘 다 통과한다. unique 제약에 맡기면
 * 반드시 한쪽만 성공한다.
 */
const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}
