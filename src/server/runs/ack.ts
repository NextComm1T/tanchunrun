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

/** `rawSeq` 로 식별되는 점. 저장된 행과 새로 온 점이 같은 모양으로 들어온다. */
export type KeyedPayload = StoredPayload & { rawSeq: number };

export type AppendPlan<P extends KeyedPayload> =
  /** 배치 전체를 거절한다. `rawSeq` 는 입력 순서상 처음 걸린 점이다. */
  | { kind: "conflict"; rawSeq: number }
  /** 새로 써야 할 점. 이미 같은 값으로 저장된 점과 배치 안의 중복은 빠져 있다. */
  | { kind: "write"; fresh: P[] };

/**
 * 새로 온 배치를 이미 저장된 점과 견줘 무엇을 쓸지 정한다(#114).
 *
 * - 저장된 키에 **같은 값** → 멱등. 다시 쓰지 않는다.
 * - 저장된 키에 **다른 값** → `conflict`. **배치 전체**를 거절한다 — 일부만 쓰면 client 가
 *   어디까지 들어갔는지 알 수 없다.
 * - **한 배치 안에서 같은 `rawSeq` 가 두 번** 오면 같은 규칙을 배치 안에도 적용한다. 같은 값이면
 *   하나만 쓰고 다르면 `conflict` 다. 이것을 거르지 않으면 한 INSERT 안에서 두 번째 행이
 *   `ON CONFLICT DO NOTHING` 으로 조용히 버려지는데, ACK 는 그 번호가 저장됐다고 말한다.
 *
 * **`stored` 가 동시 요청까지 반영한 값이어야 이 판정이 맞다.** 그 보장은 호출부의 잠금이
 * 한다(`points.ts`). 이 함수는 주어진 두 목록만 본다.
 */
export function planAppend<P extends KeyedPayload>(
  stored: readonly KeyedPayload[],
  incoming: readonly P[],
): AppendPlan<P> {
  const saved = new Map(stored.map((row) => [row.rawSeq, row]));
  const fresh = new Map<number, P>();

  for (const point of incoming) {
    const earlier = saved.get(point.rawSeq) ?? fresh.get(point.rawSeq);

    if (earlier === undefined) {
      fresh.set(point.rawSeq, point);
    } else if (!isSamePayload(earlier, point)) {
      return { kind: "conflict", rawSeq: point.rawSeq };
    }
  }

  return { kind: "write", fresh: [...fresh.values()] };
}

/**
 * 쓰기가 끝난 뒤의 ACK(#114). **실제로 저장된 번호만** 센다.
 *
 * `insertedRawSeqs` 는 `INSERT … RETURNING` 이 돌려준 번호다 — 넣으려고 **했던** 번호가 아니다.
 * 계획한 점이 어떤 이유로든 들어가지 않았다면 ACK 에 들어가지 않아야 client 가 그 점을
 * 버퍼에서 지우지 않고 다시 보낸다. 다시 온 점은 그때 저장된 값과 견줘진다.
 */
export function ackAfterWrite(
  storedRawSeqs: readonly number[],
  insertedRawSeqs: readonly number[],
): number {
  return ackThroughRawSeq(
    [...storedRawSeqs, ...insertedRawSeqs].sort((a, b) => a - b),
  );
}
