/**
 * 업로드 ACK 판정의 순수 규칙(#83 · D11).
 *
 * **`import "server-only"` 를 붙이지 않는다.** `src/server` 의 다른 모듈과 달리 DB · cookie ·
 * `node:` 모듈을 하나도 쓰지 않는 순수 함수라서, 이 규칙이 실제로 맞는지 테스트로 확인할 수
 * 있어야 한다(`server-only` 가 붙으면 Next 밖에서 import 하는 순간 던진다).
 * 값의 의미는 `points.ts` 가 쓰고, 이 파일은 계산만 한다.
 */

/** 저장된 점과 새로 온 점을 견줄 때 쓰는 최소 형태. */
export type StoredPayload = {
  segment: number;
  lat: number;
  lng: number;
  /** epoch ms. */
  recordedAt: number;
  accuracy: number | null;
};

/**
 * 시작값부터 **연속으로** 저장이 확인된 마지막 `rawSeq`.
 *
 * `rawSeq` 는 generation 마다 1 부터 시작하므로(D11) 점이 하나도 없으면 **0** 이다.
 * 서버에 1, 2, 4, 5 가 있으면 답은 `2` 다 — `max` 인 5 가 아니다. 3 이 비어 있는 동안
 * 4 · 5 를 ACK 하면 client 가 그 점들을 버퍼에서 지워 버려 3 을 영영 메울 수 없다.
 *
 * 입력은 오름차순이어야 하고 중복이 있어도 된다.
 */
export function ackThroughRawSeq(sortedRawSeqs: readonly number[]): number {
  let ack = 0;

  for (const rawSeq of sortedRawSeqs) {
    if (rawSeq === ack + 1) ack = rawSeq;
    else if (rawSeq > ack + 1) break;
  }

  return ack;
}

/**
 * 저장된 점과 새로 온 점이 같은 측정인가.
 *
 * 하나라도 다르면 `point_conflict` 다 — 이미 저장된 raw 측정점은 덮어쓰지 않는다.
 * `accuracy` 는 `null` 과 `undefined` 를 같은 「없음」으로 본다.
 */
export function isSamePayload(
  stored: StoredPayload,
  incoming: StoredPayload,
): boolean {
  return (
    stored.segment === incoming.segment &&
    stored.lat === incoming.lat &&
    stored.lng === incoming.lng &&
    stored.recordedAt === incoming.recordedAt &&
    (stored.accuracy ?? null) === (incoming.accuracy ?? null)
  );
}
