import { readAuthEnv } from "@/server/auth/config";
import { getViewer } from "@/server/auth/session";
import { retryFinalization } from "@/server/runs/finish";

/** Node.js runtime 이 필요하다 — `pg` 를 쓴다. */
export const runtime = "nodejs";
/** 요청마다 DB 를 본다. 정적 최적화 대상이 아니다. */
export const dynamic = "force-dynamic";

/**
 * 종료 저장 재시도(#85 · P14). body 가 없다 — 대상은 이미 `finished` 인 세션이고, 다시
 * 보낼 tracker 정보가 없다(tx2 는 서버에 저장된 점만 본다).
 */

function fail(status: number, body: { error: string }, headers?: HeadersInit) {
  return Response.json(body, { status, headers });
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/runs/[id]/retry">,
) {
  const origin = request.headers.get("origin");
  if (origin !== readAuthEnv().appOrigin.origin) {
    return fail(403, { error: "forbidden_origin" });
  }

  const viewer = await getViewer();
  if (!viewer) return fail(401, { error: "unauthenticated" });

  const { id: sessionId } = await context.params;

  const outcome = await retryFinalization(sessionId, viewer.userId);

  if (outcome.ok) {
    return Response.json({ state: outcome.state });
  }

  switch (outcome.error) {
    case "not_found":
      return fail(404, { error: "not_found" });
    case "rate_limited":
      return fail(
        429,
        { error: "rate_limited" },
        { "Retry-After": String(outcome.retryAfterSec) },
      );
    default:
      return fail(500, { error: "failed" });
  }
}
