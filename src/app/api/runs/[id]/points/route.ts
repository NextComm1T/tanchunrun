import { readAuthEnv } from "@/server/auth/config";
import { getViewer } from "@/server/auth/session";
import { declaresTooLarge, readBodyWithLimit } from "@/server/runs/bodyLimit";
import {
  appendPoints,
  type IncomingPoint,
} from "@/server/runs/points";
import {
  POINTS_MAX_BODY_BYTES,
  POINTS_MAX_PER_REQUEST,
} from "@/server/runs/policy";
import type { ClockBound } from "@/server/runs/recordedAtRange";

/** Node.js runtime 이 필요하다 — `node:crypto`(token 해시)와 `pg` 를 쓴다. */
export const runtime = "nodejs";
/** 요청마다 DB 를 본다. 정적 최적화 대상이 아니다. */
export const dynamic = "force-dynamic";

/**
 * GPS 측정점 업로드(#83 · D1 · D11 · D14).
 *
 * 검증은 전부 서버에서 한다 — 화면이 버튼을 막는 것을 인가로 치지 않는다. 좌표와 token 값은
 * 응답 · 로그 어디에도 남기지 않고, 문제가 있으면 **어느 `rawSeq` 인지만** 알려 준다.
 */

/**
 * 오류 응답 본문.
 *
 * `bound` 는 `invalid_recorded_at` 에만 붙는다(D11 2차) — client 가 그 점을 **영영 버릴지
 * (`past`) 나중에 다시 보낼지(`future`)** 정하는 근거라, 없으면 client 가 둘을 구분할 수
 * 없어 저장될 수 있는 점까지 버린다. 좌표 · 시각 값은 여전히 담지 않는다.
 */
type ErrorBody = {
  error: string;
  rawSeq?: number;
  bound?: ClockBound;
};

function fail(status: number, body: ErrorBody, headers?: HeadersInit) {
  return Response.json(body, { status, headers });
}

/**
 * client 가 보낸 배열을 믿지 않고 형태를 다시 본다.
 *
 * 하나라도 형태가 틀리면 배열 전체를 거절한다 — 일부만 받으면 `rawSeq` 가 듬성해져
 * ACK 가 영영 전진하지 못한다.
 */
function parsePoints(value: unknown): IncomingPoint[] | null {
  if (!Array.isArray(value)) return null;

  const points: IncomingPoint[] = [];

  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return null;

    const { rawSeq, segment, lat, lng, recordedAt, accuracy } = raw as Record<
      string,
      unknown
    >;

    if (
      !Number.isInteger(rawSeq) ||
      (rawSeq as number) < 1 ||
      !Number.isInteger(segment) ||
      (segment as number) < 0 ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat as number) > 90 ||
      Math.abs(lng as number) > 180 ||
      !Number.isFinite(recordedAt)
    ) {
      return null;
    }

    if (
      accuracy !== undefined &&
      accuracy !== null &&
      !Number.isFinite(accuracy)
    ) {
      return null;
    }

    points.push({
      rawSeq: rawSeq as number,
      segment: segment as number,
      lat: lat as number,
      lng: lng as number,
      recordedAt: recordedAt as number,
      accuracy: typeof accuracy === "number" ? accuracy : null,
    });
  }

  return points;
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/runs/[id]/points">,
) {
  /*
    same-origin 검사(D1 — MVP 는 Web-only). 브라우저는 cross-site POST 에 다른 Origin 을
    붙이므로 여기서 걸린다. cookie 인증이라 이 검사가 CSRF 방어의 한 겹이다.
  */
  const origin = request.headers.get("origin");
  if (origin !== readAuthEnv().appOrigin.origin) {
    return fail(403, { error: "forbidden_origin" });
  }

  /*
    처리 순서(#115) — **비용이 작은 검사부터** 한다.

    1. 선언된 크기(`Content-Length`). 헤더만 본다.
    2. ① 인증. cookie 가 없으면 DB 도 보지 않는다(`getViewer`). **미인증 요청은 본문을 읽지 않는다.**
    3. 실제 크기. 상한까지만 읽고 넘으면 멈춘다 — 1 의 선언은 믿지 않는다(chunked 에는 헤더가 없다).
    4. 형태 검증.
    5. ② 인가 → ③ rate limit → ④ 저장(`appendPoints`).

    rate-limit 행은 5 에서만 닿는다 — 1~4 에서 끊긴 요청은 bucket 을 읽지도 소비하지도 않는다(#83).
  */
  if (declaresTooLarge(request.headers.get("content-length"), POINTS_MAX_BODY_BYTES)) {
    return fail(413, { error: "payload_too_large" });
  }

  // ① 인증.
  const viewer = await getViewer();
  if (!viewer) return fail(401, { error: "unauthenticated" });

  const read = await readBodyWithLimit(request.body, POINTS_MAX_BODY_BYTES);
  if (!read.ok) {
    return read.reason === "too_large"
      ? fail(413, { error: "payload_too_large" })
      : fail(400, { error: "invalid_body" });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(read.text);
  } catch {
    return fail(400, { error: "invalid_body" });
  }

  if (typeof parsed !== "object" || parsed === null) {
    return fail(400, { error: "invalid_body" });
  }

  const { trackerToken, trackerGeneration, points } = parsed as Record<
    string,
    unknown
  >;

  if (
    typeof trackerToken !== "string" ||
    trackerToken.length === 0 ||
    !Number.isInteger(trackerGeneration) ||
    (trackerGeneration as number) < 1
  ) {
    return fail(400, { error: "invalid_body" });
  }

  const parsedPoints = parsePoints(points);
  if (!parsedPoints) return fail(400, { error: "invalid_body" });

  if (parsedPoints.length > POINTS_MAX_PER_REQUEST) {
    // client 는 점을 버리지 않는다 — 버퍼를 줄여 다시 보낸다.
    return fail(413, { error: "too_many_points" });
  }

  const { id: sessionId } = await context.params;

  const outcome = await appendPoints({
    sessionId,
    userId: viewer.userId,
    trackerToken,
    trackerGeneration: trackerGeneration as number,
    points: parsedPoints,
    now: new Date(),
  });

  if (outcome.ok) {
    return Response.json({ ackThroughRawSeq: outcome.ackThroughRawSeq });
  }

  switch (outcome.error) {
    case "not_tracker":
      return fail(403, { error: "not_tracker" });
    case "tracker_superseded":
      return fail(409, { error: "tracker_superseded" });
    case "point_conflict":
      return fail(409, { error: "point_conflict", rawSeq: outcome.rawSeq });
    case "invalid_recorded_at":
      return fail(400, {
        error: "invalid_recorded_at",
        rawSeq: outcome.rawSeq,
        bound: outcome.bound,
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
