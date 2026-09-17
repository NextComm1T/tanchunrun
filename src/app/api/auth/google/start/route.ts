import { handleStart } from "@/server/auth/handlers";

/** Node.js runtime 이 필요하다 — `node:crypto` 와 `pg` 를 쓴다. */
export const runtime = "nodejs";
/** 매 요청마다 새 state · nonce · verifier 를 만든다. 정적 최적화 대상이 아니다. */
export const dynamic = "force-dynamic";

export function GET() {
  return handleStart("google");
}
