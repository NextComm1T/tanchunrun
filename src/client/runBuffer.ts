import {
  STORES,
  withStore,
  withStoresTransaction,
  withTransaction,
  type StoreName,
} from "./idb";
import { deleteTrackerRecordForSession } from "./tracker";

/**
 * 아직 서버가 받지 못한 측정점과 종료 의사(#83 · D11).
 *
 * ## 무엇이 durable 인가
 *
 * D11 이 보존 대상을 셋으로 못박았다 — tracker record(#81 · `tracker.ts`) · **point-stream
 * durable state** · **finish intent**. 이 파일이 뒤의 둘을 맡는다. point-stream 은 같은 store 에
 * 사는 두 갈래다 — 아직 못 보낸 `BufferedPoint` 와, 서버가 영영 받지 않는 번호를 표시하는
 * `TerminalTombstone`(#164). **새 store 를 만들지 않고 record variant 를 더한 것이다.** memory · React state ·
 * `sessionStorage` · `localStorage` 에만 두지 않는다.
 *
 * ## 저장하지 않는 것
 *
 * 거리 · 페이스 · `inZone` · 경계점 · 순위 · 경과 시간 같은 **파생값**과 session token ·
 * OAuth token · profile 같은 **인증 값**은 넣지 않는다. 파생값은 raw 점과 서버 `started_at`
 * 에서 다시 계산하고, 인증 값은 복사본이 생기는 순간 유출 표면이 늘어난다.
 *
 * ## 삭제는 두 층이다 (D11 2차)
 *
 * **(A) session 전체 durable state** — ① 서버가 `saved` 확인 ② 서버가 그 session 을 permanent
 * 404 로 응답 ③ `withdraw()` 성공. **시간 기반 자동 만료를 두지 않고, `signOut()` 성공은 삭제
 * 사유가 아니다** — 로그아웃했다고 아직 못 보낸 러닝 기록을 버리면 다시 로그인해도 복구할 수 없다.
 * **(A) 가 지우는 「전부」에는 tracker record 도 든다**(#171) — 보관은 `tracker.ts` 가 하지만
 * ① · ② 의 정리는 `deleteRunData` 가 그쪽 삭제 함수를 불러 함께 끝낸다. ③ 은 `accountData.ts` 다.
 *
 * **(B) 개별 `rawSeq`** — payload 를 버리는 것이 곧 그 번호의 durable 상태를 버리는 것은 아니다.
 * 서버 쪽 사실이 달라 셋을 다르게 다룬다.
 *
 * | 사유 | 서버 상태 | 처분 |
 * | --- | --- | --- |
 * | ACK(`rawSeq <= ackThroughRawSeq`) | 그 번호가 저장돼 있다 | payload 삭제. 흔적 없음 |
 * | `point_conflict` | 같은 번호의 행이 **이미 있다** — gap 이 아니다 | payload 삭제. tombstone 없음 |
 * | `invalid_recorded_at` · `bound = past` | 행이 **없다** — 영구 빈 자리 | payload → **tombstone** |
 *
 * `bound = future` 는 terminal 이 아니라 재시도 가능 실패다. 어느 것도 하지 않는다.
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
 * 서버가 **영영 받지 않는** `rawSeq` 하나(#164 · D11 2차).
 *
 * `invalid_recorded_at` 의 `bound = past` 는 `started_at` 이 고정이라 다시 보내도 결과가 같다.
 * 그 점을 그냥 지우면 **종료 전 reload · 탭 재오픈에서 빈 자리였다는 사실이 사라져** 종료가
 * 영영 `points_missing` 이 된다(#164 가 고치는 문제). 그래서 payload 만 버리고 **번호는 남긴다.**
 *
 * 측정점과 **같은 store · 같은 키**(`[sessionId, trackerGeneration, rawSeq]`)를 쓴다. 판별자는
 * `kind` 하나이고, **`kind` 가 없는 레코드는 예전에 저장된 측정점이다**(아래 `isTombstone`).
 */
export type TerminalTombstone = {
  kind: "terminal";
  /** 소유자. 측정점과 같은 규칙으로 현재 viewer 것만 본다. */
  userId: string;
  sessionId: string;
  trackerGeneration: number;
  rawSeq: number;
  /** 왜 영구 거절인가. 지금은 시각 하한 하나뿐이다. */
  reason: "invalid_recorded_at_past";
};

/** points store 에 들어가는 것 — 측정점이거나 tombstone 이다. */
export type PointStreamRecord = BufferedPoint | TerminalTombstone;

/**
 * 이 레코드가 tombstone 인가.
 *
 * **`kind` 가 없으면 측정점으로 본다.** 이 판별자가 생기기 전에 저장된 버퍼가 기기에 남아
 * 있을 수 있고(진행 중이던 러닝), 그것을 못 읽으면 그 러닝을 이어갈 수 없다. store · keyPath ·
 * index 가 그대로라 `DB_VERSION` 도 올리지 않는다.
 */
function isTombstone(record: unknown): record is TerminalTombstone {
  return (
    typeof record === "object" &&
    record !== null &&
    (record as { kind?: unknown }).kind === "terminal"
  );
}

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
  /**
   * 이 generation 에서 **빠짐없이 올린 마지막 rawSeq**. 점이 없으면 0 이다(D11).
   *
   * 서버가 끝내 받지 않은 점이 있으면 마지막으로 부여한 번호가 아니라 **그 빈 자리 앞까지**다
   * (#145 · `finishLastRawSeq`).
   */
  lastRawSeq: number;
};

/**
 * points store 에서 읽은 것을 **측정점 · terminal 번호 · 아는 최대 번호**로 가른다(#164).
 *
 * 순수 함수라 `npm test` 로 고정한다(D12 2차). 세 reader 가 같은 규칙을 쓰게 하려고 한 곳에 뒀다 —
 * 따로 적으면 한쪽만 고쳐졌을 때 「업로드에서는 빠졌는데 번호 계산에는 들어가는」 식으로 갈린다.
 *
 * **`kind` 가 없는 레코드는 측정점이다.** 이 판별자가 생기기 전에 저장된 버퍼가 기기에 남아
 * 있을 수 있고(진행 중이던 러닝), 그것을 못 읽으면 그 러닝을 이어갈 수 없다.
 */
export function partitionPointStream(records: readonly PointStreamRecord[]): {
  /** 아직 올릴 수 있는 점. `rawSeq` 오름차순. */
  points: BufferedPoint[];
  /** 서버가 영영 받지 않는 번호. 오름차순. */
  terminalRawSeqs: number[];
  /** 둘을 통틀어 이 기기가 아는 가장 큰 번호. 없으면 0. */
  maxRawSeq: number;
} {
  const points: BufferedPoint[] = [];
  const terminalRawSeqs: number[] = [];
  let maxRawSeq = 0;

  for (const record of records) {
    if (record.rawSeq > maxRawSeq) maxRawSeq = record.rawSeq;
    if (isTombstone(record)) terminalRawSeqs.push(record.rawSeq);
    else points.push(record);
  }

  points.sort((a, b) => a.rawSeq - b.rawSeq);
  terminalRawSeqs.sort((a, b) => a - b);

  return { points, terminalRawSeqs, maxRawSeq };
}

/**
 * 종료 요청에 넣을 `lastRawSeq`(#145).
 *
 * 서버는 `1..lastRawSeq` 가 **빠짐없이** 저장돼 있어야 종료를 받는다. 그런데 서버가 끝내 받지
 * 않는 점(범위 밖 `recordedAt` 등)이 하나 생기면 그 번호는 영영 빈 자리로 남는다. 그때
 * 「마지막으로 부여한 번호」를 그대로 보내면 종료가 영영 `points_missing` 이 된다.
 *
 * 그래서 **빈 자리 바로 앞까지**를 보낸다. 그 뒤의 점들은 이미 서버에 저장돼 있고 결과 확정은
 * 저장된 점을 전부 쓰므로 버려지지 않는다 — 종료 판정만 연속 구간까지로 끊는 것이다.
 */
export function finishLastRawSeq(
  nextRawSeq: number,
  droppedRawSeqs: readonly number[],
): number {
  const assigned = Math.max(0, Math.floor(nextRawSeq) - 1);
  const firstDropped = droppedRawSeqs
    .filter((rawSeq) => rawSeq >= 1 && rawSeq <= assigned)
    .sort((a, b) => a - b)[0];

  return firstDropped === undefined ? assigned : firstDropped - 1;
}

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

/**
 * 같은 복합 키에서 **그 세션의 모든 generation** 구간.
 *
 * (A) permanent cleanup 이 보는 범위다 — D14 takeover 로 한 기기에 같은 세션의 gen 1 · 3
 * 레코드가 함께 남을 수 있어서, generation 하나만 지우면 나머지가 영구히 남는다.
 * 하한이 `1` 인 것은 `tracker_generation >= 1` · `raw_seq >= 1` 이 둘 다 계약이기 때문이다
 * (D11 · D14 · `schema.ts` 의 CHECK).
 */
function sessionRange(sessionId: string): IDBKeyRange {
  return IDBKeyRange.bound(
    [sessionId, 1, 1],
    [sessionId, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  );
}

/**
 * 그 세션의 레코드 중 **소유자가 `userId` 인 것만** 지운다.
 *
 * key range 로 한 번에 지우지 않는 이유는 키에 `userId` 가 없어서다 — 값을 봐야
 * 소유자를 안다. D11 은 현재 viewer 와 `userId` 가 다른 레코드를 **임의로 삭제하지
 * 않는다**고 못박았고, 그 규칙이 (A) 라고 해서 풀리지 않는다.
 */
function deleteSessionRecordsOwnedBy(
  store: IDBObjectStore,
  input: { userId: string; sessionId: string },
): void {
  const request = store.openCursor(sessionRange(input.sessionId));

  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;

    const record = cursor.value as { userId?: unknown } | null;
    if (
      typeof record === "object" &&
      record !== null &&
      record.userId === input.userId
    ) {
      cursor.delete();
    }

    cursor.continue();
  };
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
 * 이 generation 의 point-stream 레코드 전부(측정점 + tombstone). 정렬은 `partitionPointStream` 이 한다.
 *
 * **소유자가 다르면 걸러 낸다.** 지우지는 않는다.
 */
async function readPointStream(input: {
  userId: string;
  sessionId: string;
  trackerGeneration: number;
}): Promise<PointStreamRecord[]> {
  const stored = await withStore(STORES.points, "readonly", (store) =>
    store.getAll(generationRange(input)),
  ).catch(() => [] as unknown[]);

  return (stored as PointStreamRecord[]).filter(
    (record) => record.userId === input.userId,
  );
}

/**
 * 아직 보내지 못한 점을 `rawSeq` 오름차순으로 읽는다.
 *
 * **tombstone 은 빼고 준다** — 측정점이 아니라 「이 번호는 서버가 받지 않는다」는 표시라
 * 다시 올리면 같은 400 을 영원히 받는다(#164).
 */
export async function readBufferedPoints(input: {
  userId: string;
  sessionId: string;
  trackerGeneration: number;
}): Promise<BufferedPoint[]> {
  return partitionPointStream(await readPointStream(input)).points;
}

/**
 * 서버가 영영 받지 않는다고 표시된 `rawSeq` 들(#164). 오름차순.
 *
 * 러닝 화면이 **다시 열릴 때마다 이것으로 메모리 상태를 복원한다** — 이 표시가 durable 하지
 * 않으면 reload 한 순간 빈 자리를 잊고 종료가 영영 `points_missing` 이 된다.
 */
export async function readTerminalRawSeqs(input: {
  userId: string;
  sessionId: string;
  trackerGeneration: number;
}): Promise<number[]> {
  return partitionPointStream(await readPointStream(input)).terminalRawSeqs;
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
 * 아직 **보낼 수 있는** 점 중 가장 큰 `rawSeq`. 없으면 0.
 *
 * tombstone 은 세지 않는다 — 이름 그대로 버퍼에 남은 측정점만 본다. 다음 번호를 정할 때는
 * `maxKnownRawSeq` 를 쓴다.
 */
export async function maxBufferedRawSeq(input: {
  userId: string;
  sessionId: string;
  trackerGeneration: number;
}): Promise<number> {
  const points = await readBufferedPoints(input);

  return points.at(-1)?.rawSeq ?? 0;
}

/**
 * 이 기기가 **아는** 가장 큰 `rawSeq` — 버퍼에 남은 점과 tombstone 을 함께 본다. 없으면 0.
 *
 * 다시 열었을 때 이어 붙일 번호는 **`max(서버 max, 이 값) + 1`** 이다(D11 2차).
 * `ackThroughRawSeq + 1` 로 하면 이미 서버에 있는 번호를 다른 좌표로 재사용해 충돌하고,
 * **tombstone 을 빼고 세면 영구 거절된 번호를 다른 점에 다시 부여한다** — 같은 generation 의
 * `rawSeq` 를 다른 payload 로 재사용하지 않는다는 규칙을 깬다.
 */
export async function maxKnownRawSeq(input: {
  userId: string;
  sessionId: string;
  trackerGeneration: number;
}): Promise<number> {
  return partitionPointStream(await readPointStream(input)).maxRawSeq;
}

/**
 * 영영 거절된 점을 **tombstone 으로 원자 치환**한다(#164 · D11 2차).
 *
 * **지우고 나서 따로 쓰지 않는다.** 두 트랜잭션으로 나누면 그 사이에 탭이 죽었을 때 점도
 * 근거도 없는 상태가 되어, 다시 열었을 때 빈 자리를 몰라 종료가 영영 막힌다 — 이 함수가
 * 막으려는 상황 그 자체다. 같은 키에 `put` 하므로 한 번에 갈린다.
 *
 * `finishIntent` 를 함께 넘기면 **같은 트랜잭션에서** 그것도 쓴다. 결과 화면의 종료 recovery
 * 처럼 「빈 자리 표시」와 「낮춘 `lastRawSeq`」가 동시에 필요한 경우다.
 */
export async function markTerminalRawSeq(input: {
  userId: string;
  sessionId: string;
  trackerGeneration: number;
  rawSeq: number;
  finishIntent?: FinishIntent;
}): Promise<void> {
  const tombstone: TerminalTombstone = {
    kind: "terminal",
    userId: input.userId,
    sessionId: input.sessionId,
    trackerGeneration: input.trackerGeneration,
    rawSeq: input.rawSeq,
    reason: "invalid_recorded_at_past",
  };

  const stores: StoreName[] = input.finishIntent
    ? [STORES.points, STORES.finishIntent]
    : [STORES.points];

  await withStoresTransaction(stores, "readwrite", (getStore) => {
    getStore(STORES.points).put(tombstone);
    if (input.finishIntent) {
      getStore(STORES.finishIntent).put(input.finishIntent);
    }
  });
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
 * 한 세션의 로컬 자취를 **전부** 지운다 — 위 (A) 의 ① · ② 에서만 부른다(#171 · D11 2차).
 * 시간이 지났다고, 로그아웃했다고 부르지 않는다.
 *
 * **「전부」가 세 가지 모두이고 모든 generation 이다.** (A) 는 「session 전체 durable state」라
 * 서, point-stream(측정점 + tombstone) · finish intent · **tracker record** 셋을 그 세션의 어느
 * generation 것이든 지운다. 옛 구현은 인자로 받은 generation 하나의 point-stream 만 지워서,
 * D14 takeover 를 거친 세션의 옛 generation 버퍼 · tombstone 과 tracker record 가 `saved` 뒤에도
 * 기기에 남았다.
 *
 * **남의 것은 지우지 않는다.** 세 갈래 모두 `userId` 가 맞을 때만 지운다 — 같은 기기를 두
 * 사람이 쓸 수 있고, D11 은 다른 소유자의 레코드를 「원 소유자의 재로그인 복구를 위해 임의로
 * 삭제하지 않는다」고 못박았다. **소유자 확인은 지우는 트랜잭션 안에서 한다** — 읽고 나서
 * 따로 지우면 그 사이에 다른 러닝이 같은 키를 덮어써도 옛 판정으로 지운다(#191).
 *
 * **세 갈래를 각각 시도한다.** 하나가 실패해도 나머지는 지운다 — 「전부」가 계약이라 첫 실패로
 * 멈추면 계약보다 좁아진다. 실패가 있었으면 그대로 던져서 호출부가 알 수 있게 한다.
 * **읽기 실패를 삼키지 않는다** — 삼키면 지우지 못한 갈래가 성공으로 보고된다.
 */
export async function deleteRunData(input: {
  userId: string;
  sessionId: string;
  /**
   * 호출부가 알고 있는 현재 generation. **이 값으로 범위를 좁히지 않는다** — (A) 는 세션
   * 전체다. 호출부 계약을 깨지 않으려고 받아만 두고 쓰지 않는다.
   */
  trackerGeneration?: number;
}): Promise<void> {
  const { userId, sessionId } = input;

  const settled = await Promise.allSettled([
    withTransaction(STORES.points, "readwrite", (store) => {
      deleteSessionRecordsOwnedBy(store, { userId, sessionId });
    }),
    withTransaction(STORES.finishIntent, "readwrite", (store) => {
      const request = store.get(sessionId);

      request.onsuccess = () => {
        const stored: unknown = request.result;
        if (typeof stored !== "object" || stored === null) return;
        if ((stored as Partial<FinishIntent>).userId !== userId) return;

        store.delete(sessionId);
      };
    }),
    deleteTrackerRecordForSession({ userId, sessionId }),
  ]);

  const failed = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed) throw failed.reason;
}
