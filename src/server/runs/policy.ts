import "server-only";

/**
 * 러닝 업로드 · 종료의 서버 검증 상수(#83 · D11).
 *
 * **`src/domain/measure` 에 두지 않는다.** 이 값들은 거리를 재는 규칙이 아니라 서버가 요청을
 * 받아들이는 조건이다. 측정 계산은 client 와 server 가 같은 식을 써야 해서 domain 에 있지만,
 * 이 상수들은 서버만 본다.
 *
 * **이 파일이 정본이고 #85 가 import 한다.** 같은 숫자를 두 곳에 적으면 한쪽만 고쳐질 때
 * client 가 보낸 것을 서버가 조용히 거절하는 상태가 된다.
 */

/**
 * 기기 시계가 서버보다 앞설 수 있는 한계(ms).
 *
 * 이 범위를 넘는 `recordedAt` 은 **거절하고 clamp 하지 않는다.** clamp 하면 구간 시간이
 * 달라져 segment 끊김 판정(D10)과 속도 제외(P9)가 조용히 틀어진다. 틀린 값을 고쳐서 받느니
 * 어느 `rawSeq` 가 문제인지 말해 주고 돌려보낸다.
 */
export const FUTURE_CLOCK_TOLERANCE_MS = 60_000;

/**
 * 반대쪽 한계 — `started_at` 보다 이른 `recordedAt` 을 어디까지 받아 주는가(#145).
 *
 * **여기서 새로 정하지 않고 domain 의 값을 그대로 쓴다.** client 가 accept 판정에 같은 값을
 * 쓰기 때문이다(`src/domain/measure/fix.ts`). 서버가 더 좁으면 client 가 이미 번호를 부여한
 * 점이 영영 거절되고, 그 번호가 빈 자리로 남아 업로드 · 종료가 통째로 막힌다(#145).
 *
 * 값을 고치지 않는 원칙은 그대로다 — 허용 범위만 미래 쪽과 대칭으로 두고, 벗어나면 거절한다.
 */
export { RUN_START_CLOCK_TOLERANCE_MS as PAST_CLOCK_TOLERANCE_MS } from "@/domain/measure";

/** 한 요청에 담을 수 있는 점 개수. 넘으면 거절하고, client 는 나눠 다시 보낸다. */
export const POINTS_MAX_PER_REQUEST = 500;

/** 한 요청의 본문 크기 상한(bytes · 256KiB). */
export const POINTS_MAX_BODY_BYTES = 262_144;

/**
 * 종료 요청의 본문 크기 상한(bytes · 4KiB · #115).
 *
 * 실제 본문은 tracker token(43자)과 숫자 셋이라 약 120 byte 다. 30 배 넘게 여유를 두어 필드가
 * 조금 늘어도 정상 요청을 막지 않되, 상한이 없어 종료 경로로 큰 본문을 밀어 넣을 수 있던 틈을 닫는다.
 */
export const FINISH_MAX_BODY_BYTES = 4_096;

/**
 * points bucket 의 용량(token).
 *
 * 1초에 하나씩 차므로 **60초치 여유**다. 오프라인에서 쌓인 것을 몰아 보내는 정상 동작을
 * 막지 않을 만큼 크고, 폭주는 막을 만큼 작다.
 */
export const POINTS_BUCKET_CAPACITY = 60;

/** 초당 충전량(token/s). */
export const POINTS_BUCKET_REFILL_PER_SECOND = 1;

/**
 * 요청 하나가 쓰는 token.
 *
 * 점 100개마다 1 을 더한다 — 작은 요청을 자주 보내는 것과 큰 요청을 가끔 보내는 것의
 * 비용을 비슷하게 맞춘다. 상한(500점)에서도 6 이라 용량 60 을 한 번에 비우지 못한다.
 */
export function pointsBucketCost(pointCount: number): number {
  return 1 + Math.floor(pointCount / 100);
}

/**
 * finish bucket(bucket B · #85 · D11). `finishRun` · `retryFinalization` 이 공유한다.
 *
 * key 는 `session_id` 다 — 한 세션을 끝내려는 시도 자체를 제한하는 것이라 `points` bucket과
 * 달리 user 가 아니라 session 에 건다.
 */
export const FINISH_BUCKET_CAPACITY = 5;

/** 3초에 하나씩 찬다. */
export const FINISH_BUCKET_REFILL_PER_SECOND = 1 / 3;

/** 요청 하나가 쓰는 token. `finishRun` 재시도든 `retryFinalization` 이든 언제나 1이다. */
export const FINISH_BUCKET_COST = 1;
