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

/** 한 요청에 담을 수 있는 점 개수. 넘으면 거절하고, client 는 나눠 다시 보낸다. */
export const POINTS_MAX_PER_REQUEST = 500;

/** 한 요청의 본문 크기 상한(bytes · 256KiB). */
export const POINTS_MAX_BODY_BYTES = 262_144;

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
