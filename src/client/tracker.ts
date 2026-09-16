/**
 * tracker record 의 durable 저장(#81 · D11 · D14).
 *
 * **이 기기가 지금 러닝의 writer 인지**를 판정하는 근거다. 서버는 어느 기기가 tracker 인지
 * 모르고 해시만 갖고 있으므로, token 을 가진 쪽이 자기가 writer 임을 안다.
 *
 * **왜 IndexedDB 인가**(D11) — 탭 닫기 · 브라우저 종료 · OS 재부팅 · 오프라인 · hidden 전환을
 * 넘어 살아남아야 한다. `sessionStorage` 는 탭과 함께 사라지고, `localStorage` 는
 * 남지만 D11 이 durable 저장소를 IndexedDB 하나로 못박았다(#83 의 점 버퍼 · #85 의 finish
 * intent 가 같은 저장소를 쓴다).
 *
 * **저장하지 않는 것**: 파생값(거리 · 페이스 · 경과 시간)과 인증 값(session token · OAuth
 * token · profile). 파생값은 raw 점과 서버 `started_at` 에서 다시 계산한다.
 *
 * `src/server` 의 대칭으로 `src/client` 에 둔다 — 홈과 러닝 두 화면이 쓰고 #83 · #85 도 쓸
 * 브라우저 전용 모듈이라 어느 한 화면 폴더에 넣을 수 없다.
 */

const DB_NAME = "tancheonrun";
const DB_VERSION = 1;
const STORE_NAME = "tracker";

/**
 * 한 기기가 들고 있는 tracker 기록.
 *
 * **`userId` 가 함께 들어 있는 것이 중요하다**(D11). 같은 기기를 두 사람이 쓸 수 있어서,
 * 읽을 때마다 현재 로그인한 사람의 것인지 확인해야 한다.
 */
export type TrackerRecord = {
  userId: string;
  sessionId: string;
  trackerToken: string;
  trackerGeneration: number;
};

/** 한 계정에 진행 중 러닝이 하나뿐이라 레코드도 하나뿐이다. */
const RECORD_KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();

  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = run(tx.objectStore(STORE_NAME));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * 러닝을 시작한 기기가 **이동하기 전에** 부른다.
 *
 * 저장이 끝난 뒤 이동해야 한다 — 저장 전에 화면을 옮기고 그 사이에 탭이 죽으면 서버에는
 * active 세션이 있는데 어느 기기도 token 을 갖지 못한 상태가 된다. 그러면 사용자가
 * 「이 기기에서 이어서 측정」으로 인수하기 전까지 그 러닝을 이어갈 수 없다.
 */
export async function saveTrackerRecord(record: TrackerRecord): Promise<void> {
  await withStore("readwrite", (store) => store.put(record, RECORD_KEY));
}

/**
 * 이 기기의 tracker 기록을 읽는다. **현재 사용자의 것이 아니면 `null` 이다.**
 *
 * 다른 사용자의 레코드를 만나도 **지우지 않는다**(D11). 원 소유자가 다시 로그인하면 그
 * 러닝을 이어갈 수 있어야 한다. 읽지 · 표시하지 · 전송하지 않는 것으로 충분하다.
 */
export async function readTrackerRecord(
  userId: string,
): Promise<TrackerRecord | null> {
  const stored = await withStore("readonly", (store) =>
    store.get(RECORD_KEY),
  ).catch(() => undefined);

  if (!isTrackerRecord(stored)) return null;
  if (stored.userId !== userId) return null;

  return stored;
}

/**
 * 저장된 기록이 이 세션의 **현재 generation** writer 인지 본다(D14).
 *
 * generation 이 낮으면 다른 기기가 인수해 간 것이다 — 그 기기는 read-only 로 돌아간다.
 */
export async function isCurrentTracker(input: {
  userId: string;
  sessionId: string;
  trackerGeneration: number;
}): Promise<boolean> {
  const record = await readTrackerRecord(input.userId);
  if (!record) return false;

  return (
    record.sessionId === input.sessionId &&
    record.trackerGeneration === input.trackerGeneration
  );
}

/**
 * 저장소가 비워지지 않도록 요청한다(best-effort).
 *
 * **실패하거나 지원하지 않아도 러닝을 실패시키지 않는다**(D11). 저장소 증발은 보장을 걸 수
 * 없는 잔여 위험이고, 그 경우의 해소 경로는 사용자가 「이 기기에서 이어서 측정」으로
 * 인수하는 것이다.
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // 무시한다. 러닝을 막을 이유가 아니다.
  }
}

function isTrackerRecord(value: unknown): value is TrackerRecord {
  if (typeof value !== "object" || value === null) return false;

  const record = value as Partial<TrackerRecord>;

  return (
    typeof record.userId === "string" &&
    typeof record.sessionId === "string" &&
    typeof record.trackerToken === "string" &&
    typeof record.trackerGeneration === "number"
  );
}
