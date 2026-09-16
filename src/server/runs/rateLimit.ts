import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import type { RateLimitKind } from "@/server/db/schema";

/**
 * PostgreSQL token bucket(#83 · D11).
 *
 * **왜 DB 인가** — Vercel serverless 는 요청마다 다른 인스턴스로 갈 수 있어서 메모리
 * 카운터는 아무것도 제한하지 못한다.
 *
 * **자원 보호일 뿐 정확성 검사가 아니다.** 소유권 · tracker · 시각 검증을 대신하지 않고,
 * anti-cheat 도 아니다. 그래서 호출부는 **인증 · 인가를 통과한 뒤에만** 이 함수를 부른다 —
 * 그러지 않으면 남이 내 bucket 을 고갈시킬 수 있다.
 */

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

type ConsumeInput = {
  kind: RateLimitKind;
  /** bucket 의 키. **IP 가 아니다** — 모바일 NAT 에서 IP 는 여러 사람이 공유한다. */
  userId: string;
  cost: number;
  capacity: number;
  refillPerSecond: number;
};

/**
 * 충전을 반영한 뒤 `cost` 만큼 쓴다. 모자라면 아무것도 쓰지 않고 거절한다.
 *
 * **차감은 UPDATE 한 문장 안에서 일어난다.** 읽고 나서 쓰면 두 요청이 같은 잔량을 보고
 * 둘 다 통과한다. 조건(`잔량 >= cost`)을 WHERE 에 넣으면 행 잠금이 직렬화해 주므로
 * 반드시 한쪽만 통과한다.
 *
 * 마지막 갱신 이후 흐른 시간만큼 충전하고 용량에서 자른다. `now()` 는 **DB 시각**이라
 * 인스턴스마다 다른 기기 시계를 타지 않는다.
 */
export async function consumeUserTokens({
  kind,
  userId,
  cost,
  capacity,
  refillPerSecond,
}: ConsumeInput): Promise<RateLimitDecision> {
  const db = getDb();

  // 가득 찬 bucket 을 만들어 둔다. 이미 있으면 아무 일도 하지 않는다.
  await db.execute(sql`
    insert into rate_limits (kind, user_id, tokens, updated_at)
    values (${kind}, ${userId}, ${capacity}, now())
    on conflict (kind, user_id) where session_id is null do nothing
  `);

  const refilled = sql`least(
    ${capacity}::numeric,
    rate_limits.tokens + extract(epoch from (now() - rate_limits.updated_at)) * ${refillPerSecond}::numeric
  )`;

  const consumed = await db.execute(sql`
    update rate_limits
       set tokens = ${refilled} - ${cost}::numeric,
           updated_at = now()
     where kind = ${kind}
       and user_id = ${userId}
       and session_id is null
       and ${refilled} >= ${cost}::numeric
    returning tokens
  `);

  if (consumed.rowCount && consumed.rowCount > 0) return { allowed: true };

  return { allowed: false, retryAfterSec: await retryAfter() };

  /**
   * 얼마나 기다리면 되는지. 모자란 만큼을 충전 속도로 나눈다.
   *
   * 잔량을 못 읽으면(행이 사라졌거나 조회 실패) 1초를 준다 — 기다리라고 말해 놓고 얼마나
   * 기다릴지 모른다고 답할 수는 없다.
   */
  async function retryAfter(): Promise<number> {
    try {
      const rows = await db.execute<{ available: string }>(sql`
        select ${refilled} as available
          from rate_limits
         where kind = ${kind} and user_id = ${userId} and session_id is null
      `);

      const available = Number(rows.rows[0]?.available);
      if (!Number.isFinite(available)) return 1;

      return Math.max(1, Math.ceil((cost - available) / refillPerSecond));
    } catch {
      return 1;
    }
  }
}
