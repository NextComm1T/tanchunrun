/**
 * DB 오류의 SQLSTATE 판별(#146).
 *
 * **`import "server-only"` 를 붙이지 않는다.** `src/server` 의 다른 모듈과 달리 DB · cookie ·
 * `node:` 모듈을 하나도 쓰지 않는 순수 함수라서, 판정이 실제로 맞는지 테스트로 확인할 수
 * 있어야 한다(`server-only` 가 붙으면 Next 밖에서 import 하는 순간 던진다) — `runs/ack.ts` ·
 * `ranking/rank.ts` 와 같은 이유다. 서버가 쓰는 입구는 `errors.ts` 이고 이 파일은 판정만 한다.
 */

/**
 * PostgreSQL `unique_violation`.
 *
 * **중복을 이 오류로 판정하는 것이 중요하다.** 먼저 SELECT 해서 "있나?" 를 본 뒤 INSERT 하면
 * 두 요청이 동시에 들어왔을 때 둘 다 "없음" 을 보고 둘 다 통과한다. unique 제약에 맡기면
 * 반드시 한쪽만 성공한다.
 */
const UNIQUE_VIOLATION = "23505";

/**
 * `cause` 를 따라갈 최대 깊이.
 *
 * drizzle-orm `0.45.2` 는 한 겹만 감싸지만(`DrizzleQueryError`), 깊이를 세지 않으면 `cause` 가
 * 자기 자신을 가리키는 오류에서 멈추지 못한다.
 */
const MAX_CAUSE_DEPTH = 5;

/**
 * 이 오류가 unique 위반인가.
 *
 * `pg` 는 서버가 보낸 SQLSTATE 를 `error.code` 에 문자열로 담아 준다. **drizzle 은 그 오류를
 * 그대로 던지지 않는다** — `DrizzleQueryError` 로 감싸고 원 오류를 `cause` 에 둔다
 * (`drizzle-orm/pg-core/session.js` `queryWithCache`). 감싼 쪽에는 `code` 가 없으므로
 * 겉만 보면 중복을 놓치고 호출부가 `failed` 로 떨어뜨린다(#146).
 *
 * 그래서 겉과 `cause` 체인을 함께 본다. 감싸는 방식이 바뀌어도 판정이 따라가도록 한 겹으로
 * 고정하지 않는다.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) return false;

    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
