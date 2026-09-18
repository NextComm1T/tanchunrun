import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./sqlstate";

/**
 * `pg` 가 던지는 오류의 최소 형태. 실제 오류에는 `detail` · `constraint` 등이 더 붙지만
 * 판정에 쓰는 것은 `code` 하나다.
 */
function pgError(code: string): Error & { code: string } {
  return Object.assign(new Error(`pg error ${code}`), { code });
}

/** drizzle 이 실제로 감싸는 방식 — 원 오류를 `cause` 에 둔다. */
function wrapped(cause: Error): DrizzleQueryError {
  return new DrizzleQueryError("insert into users ...", [], cause);
}

describe("isUniqueViolation", () => {
  it("감싸지 않은 pg 오류를 판별한다", () => {
    expect(isUniqueViolation(pgError("23505"))).toBe(true);
  });

  it("drizzle 이 감싼 오류도 판별한다 — #146 이 놓치던 경로다", () => {
    const error = wrapped(pgError("23505"));

    // 감싼 쪽에는 `code` 가 없다. 겉만 보면 중복을 놓친다.
    expect((error as unknown as { code?: unknown }).code).toBeUndefined();
    expect(isUniqueViolation(error)).toBe(true);
  });

  it("다른 SQLSTATE 는 unique 위반이 아니다", () => {
    // 23503 foreign_key_violation · 23502 not_null_violation
    expect(isUniqueViolation(pgError("23503"))).toBe(false);
    expect(isUniqueViolation(wrapped(pgError("23502")))).toBe(false);
  });

  it("code 가 없는 오류는 false 다", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(wrapped(new Error("boom")))).toBe(false);
  });

  it("오류가 아닌 값에 던지지 않는다", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation(23505)).toBe(false);
  });

  it("cause 가 자기 자신을 가리켜도 멈춘다", () => {
    const loop: { code?: string; cause?: unknown } = {};
    loop.cause = loop;

    expect(isUniqueViolation(loop)).toBe(false);
  });

  it("상한을 넘게 감싸인 오류는 판별하지 않는다 — 무한 탐색을 하지 않기 때문이다", () => {
    let error: Error = pgError("23505");
    for (let i = 0; i < 3; i += 1) error = wrapped(error);
    expect(isUniqueViolation(error)).toBe(true);

    for (let i = 0; i < 4; i += 1) error = wrapped(error);
    expect(isUniqueViolation(error)).toBe(false);
  });
});
