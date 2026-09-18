import "server-only";

/**
 * DB 오류 판별. 서버 코드가 쓰는 입구다.
 *
 * 판정 자체는 `sqlstate.ts` 가 한다 — 그쪽은 `server-only` 가 없는 순수 모듈이라 `npm test` 로
 * 확인할 수 있다. 여기서 다시 내보내는 것은 호출부가 서버 전용 경계를 그대로 지나가게 하기
 * 위해서다.
 */
export { isUniqueViolation } from "./sqlstate";
