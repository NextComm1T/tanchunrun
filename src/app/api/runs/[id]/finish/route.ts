import { readAuthEnv } from "@/server/auth/config";
import { getViewer } from "@/server/auth/session";
import { finishRun } from "@/server/runs/finish";

/** Node.js runtime 이 필요하다 — `node:crypto`(tracker token 해시)와 `pg` 를 쓴다. */
export const runtime = "nodejs";
/** 요청마다 DB 를 본다. 정적 최적화 대상이 아니다. */
export const dynamic = "force-dynamic";

/**
 * 러닝 종료(#85 · D11 · D13 · D14). 검증은 전부 서버에서 한다 — 화면이 슬라이드를 다 밀게
 * 한 것을 인가로 치지 않는다. 좌표 · token 값은 응답 · 로그 어디에도 남기지 않는다.
 */

type ErrorBody = { error: string; expectedNextRawSeq?: number };

function fail(status: number, body: ErrorBody, headers?: HeadersInit) {
  return Response.json(body, { status, headers });
}

function parseBody(value: unknown): {
  trackerToken: string;
  trackerGeneration: number;
  clientFinishedAt: number;
  lastRawSeq: number;
} | null {
  if (typeof value !== "object" || value === null) return null;

  const { trackerToken, trackerGeneration, clientFinishedAt, lastRawSeq } =
    value as Record<string, unknown>;

  if (
    typeof trackerToken !== "string" ||
    trackerToken.length === 0 ||
    !Number.isInteger(trackerGeneration) ||
    (trackerGeneration as number) < 1 ||
    !Number.isFinite(clientFinishedAt) ||
    !Number.isInteger(lastRawSeq) ||
    (lastRawSeq as number) < 0
  ) {
    return null;
  }

  return {
    trackerToken,
    trackerGeneration: trackerGeneration as number,
    clientFinishedAt: clientFinishedAt as number,
    lastRawSeq: lastRawSeq as number,
  };
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/runs/[id]/finish">,
) {
  // same-origin 검사(D1 — MVP 는 Web-only). cookie 인증이라 CSRF 방어의 한 겹이다.
  const origin = request.headers.get("origin");
  if (origin !== readAuthEnv().appOrigin.origin) {
    return fail(403, { error: "forbidden_origin" });
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return fail(400, { error: "invalid_body" });
  }

  const body = parseBody(parsed);
  if (!body) return fail(400, { error: "invalid_body" });

  // ① 인증.
  const viewer = await getViewer();
  if (!viewer) return fail(401, { error: "unauthenticated" });

  const { id: sessionId } = await context.params;

  const outcome = await finishRun({
    sessionId,
    userId: viewer.userId,
    trackerToken: body.trackerToken,
    trackerGeneration: body.trackerGeneration,
    clientFinishedAt: body.clientFinishedAt,
    lastRawSeq: body.lastRawSeq,
  });

  if (outcome.ok) {
    return Response.json({ state: outcome.state });
  }

  switch (outcome.error) {
    case "not_tracker":
      return fail(403, { error: "not_tracker" });
    case "tracker_superseded":
      return fail(409, { error: "tracker_superseded" });
    case "points_missing":
      return fail(409, {
        error: "points_missing",
        expectedNextRawSeq: outcome.expectedNextRawSeq,
      });
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
