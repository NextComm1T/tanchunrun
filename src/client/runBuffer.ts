import { STORES, withStore, withTransaction } from "./idb";

/**
 * 아직 서버가 받지 못한 측정점과 종료 의사(#83 · D11).
 *
 * ## 무엇이 durable 인가
 *
 * D11 이 보존 대상을 셋으로 못박았다 — tracker record(#81 · `tracker.ts`) · **미ACK
 * 측정점 버퍼** · **finish intent**. 이 파일이 뒤의 둘을 맡는다. memory · React state ·
 * `sessionStorage` · `localStorage` 에만 두지 않는다.
 *
 * ## 저장하지 않는 것
 *
 * 거리 · 페이스 · `inZone` · 경계점 · 순위 · 경과 시간 같은 **파생값**과 session token ·
 * OAuth token · profile 같은 **인증 값**은 넣지 않는다. 파생값은 raw 점과 서버 `started_at`
 * 에서 다시 계산하고, 인증 값은 복사본이 생기는 순간 유출 표면이 늘어난다.
 *
 * ## 삭제는 네 가지뿐
 *
 * ① 서버가 `saved` 확인 ② ACK 된 점 개별 삭제 ③ 서버가 그 session 을 permanent 404 로 응답
 * ④ `withdraw()` 성공. **시간 기반 자동 만료를 두지 않고, `signOut()` 성공은 삭제 사유가
 * 아니다** — 로그아웃했다고 아직 못 보낸 러닝 기록을 버리면 다시 로그인해도 복구할 수 없다.
 *
 * ## user-bound
 *
 * 모든 레코드가 소유자 `userId` 를 함께 갖는다. 같은 기기를 두 사람이 쓸 수 있어서,
 * **현재 viewer 와 `userId` 가 다른 레코드는 읽지 · 표시 · 전송하지 않는다.** 그렇다고
 * 지우지도 않는다 — 원 소유자가 다시 로그인하면 이어갈 수 있어야 한다.
 */

/** 버퍼에 쌓이는 측정점. 서버로 보내는 형태 그대로다. */
export type BufferedPoint = {
  /** 소유자. 현재 viewer 와 다르면 건드리지 않는다. */
  userId: string;
  sessionId: string;
  trackerGeneration: number;
  rawSeq: number;
  segment: number;
  lat: number;
  lng: number;
  /** epoch ms. */
  recordedAt: number;
  accuracy: number | null;
};

/**
 * 종료 의사(#85 가 채운다).
 *
 * 사용자가 종료를 눌렀다는 사실 자체가 durable 해야 한다 — 누른 직후 탭이 죽어도 다시 열면
 * 결과 recovery 로 이어져야 하기 때문이다(P14). `#83` 은 **스키마와 읽기**만 제공하고,
 * 쓰는 것과 전송은 #85 몫이다.
 */
export type FinishIntent = {
  userId: string;
  sessionId: string;
  trackerToken: string;
  trackerGeneration: number;
  /** 사용자가 종료를 누른 기기 시각(epoch ms). 서버가 이 값을 검증한다. */
  clientFinishedAt: number;
  /** 이 generation 에서 마지막으로 부여한 rawSeq. 점이 없으면 0 이다(D11). */
  lastRawSeq: number;
};

type PointKeyRange = { sessionId: string; trackerGeneration: number };

/** `[sessionId, generation, rawSeq]` 복합 키의 한 generation 구간. */
function generationRange(
  { sessionId, trackerGeneration }: PointKeyRange,
  fromRawSeq = 1,
  toRawSeq = Number.MAX_SAFE_INTEGER,
): IDBKeyRange {
  return IDBKeyRange.bound(
    [sessionId, trackerGeneration, fromRawSeq],
    [sessionId, trackerGeneration, toRawSeq],
  );
}

/** 측정점을 버퍼에 넣는다. 같은 키가 이미 있으면 덮어쓴다(같은 점을 다시 만든 경우다). */
export async function bufferPoints(
  points: readonly BufferedPoint[],
): Promise<void> {
  if (points.length === 0) return;

  await withTransaction(STORES.points, "readwrite", (store) => {
    for (const point of points) store.put(point);
  });
}

/**
 * 아직 보내지 못한 점을 `rawSeq` 오름차순으로 읽는다.
 *
 * **소유자가 다르면 걸러 낸다.** 지우지는 않는다.
 */
export async function readBufferedPoints(input: {
  userId: string;
  sessionId: string;
  trackerGeneration: number;
}): Promise<BufferedPoint[]> {
  const stored = await withStore(STORES.points, "readonly", (store) =>
    store.getAll(generationRange(input)),
  ).catch(() => [] as unknown[]);

  return (stored as BufferedPoint[])
    .filter((point) => point.userId === input.userId)
    .sort((a, b) => a.rawSeq - b.rawSeq);
}

/**
 * ACK 된 점만 지운다 — **`rawSeq <= ackThroughRawSeq` 인 것뿐**이다(D11).
 *
 * 서버에 1,2,4,5 가 있고 ACK 가 2 인 상태에서 4 · 5 까지 지우면 3 을 메운 뒤에도 그 둘을
 * 다시 보낼 수 없다. 연속 구간까지만 지우는 것이 규칙이다.
 */
export async function deleteAckedPoints(input: {
  userId: string;
  sessionId: string;
  trackerGeneration: number;
  ackThroughRawSeq: number;
}): Promise<void> {
  if (input.ackThroughRawSeq < 1) return;

  const acked = await readBufferedPoints(input);

  await withTransaction(STORES.points, "readwrite", (store) => {
    for (const point of acked) {
      if (point.rawSeq <= input.ackThroughRawSeq) {
        store.delete([point.sessionId, point.trackerGeneration, point.rawSeq]);
      }
    }
  });
}

/**
 * 점 하나만 버퍼에서 뺀다.
 *
 * `point_conflict` 를 받았을 때 쓴다 — 서버에 이미 다른 좌표로 저장된 점이라 다시 보내도
 * 계속 거절당한다. **그 점만** 빼야 한다. 연속 구간으로 지우면 아직 보내지 못한 앞 점까지
 * 사라진다.
 */
export async function deleteBufferedPoint(input: {
  sessionId: string;
  trackerGeneration: number;
  rawSeq: number;
}): Promise<void> {
  await withStore(STORES.points, "readwrite", (store) =>
    store.delete([input.sessionId, input.trackerGeneration, input.rawSeq]),
  );
}

/**
 * 버퍼에 있는 가장 큰 `rawSeq`. 없으면 0.
 *
 * 다시 열었을 때 이어 붙일 번호는 **`max(서버 max, 버퍼 max) + 1`** 이다.
 * `ackThroughRawSeq + 1` 로 하면 이미 서버에 있는 번호를 다른 좌표로 재사용해 충돌한다.
 */
export async function maxBufferedRawSeq(input: {
  userId: string;
  sessionId: string;
  trackerGeneration: number;
}): Promise<number> {
  const points = await readBufferedPoints(input);

  return points.at(-1)?.rawSeq ?? 0;
}

/** 이 세션의 종료 의사. 소유자가 다르면 `null` 이다. */
export async function readFinishIntent(input: {
  userId: string;
  sessionId: string;
}): Promise<FinishIntent | null> {
  const stored = await withStore(STORES.finishIntent, "readonly", (store) =>
    store.get(input.sessionId),
  ).catch(() => undefined);

  if (typeof stored !== "object" || stored === null) return null;

  const intent = stored as Partial<FinishIntent>;
  if (intent.userId !== input.userId) return null;
  if (typeof intent.sessionId !== "string") return null;
  if (typeof intent.trackerToken !== "string") return null;
  if (typeof intent.trackerGeneration !== "number") return null;
  if (typeof intent.clientFinishedAt !== "number") return null;
  if (typeof intent.lastRawSeq !== "number") return null;

  return intent as FinishIntent;
}

/** 종료 의사를 durable 하게 남긴다. 누른 직후 탭이 죽어도 남아 있어야 한다(#85 가 부른다). */
export async function writeFinishIntent(intent: FinishIntent): Promise<void> {
  await withStore(STORES.finishIntent, "readwrite", (store) =>
    store.put(intent),
  );
}

/**
 * 한 세션의 로컬 자취를 전부 지운다.
 *
 * **위 「삭제는 네 가지뿐」의 ① · ③ · ④ 에서만 부른다.** 시간이 지났다고, 로그아웃했다고
 * 부르지 않는다.
 */
export async function deleteRunData(input: {
  userId: string;
  sessionId: string;
  trackerGeneration: number;
}): Promise<void> {
  const mine = await readFinishIntent(input);

  await withTransaction(STORES.points, "readwrite", (store) => {
    store.delete(generationRange(input));
  });

  if (mine) {
    await withStore(STORES.finishIntent, "readwrite", (store) =>
      store.delete(input.sessionId),
    );
  }
}
