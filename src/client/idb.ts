/**
 * IndexedDB 열기 · 트랜잭션(#81 · #83 · D11).
 *
 * **durable 저장소는 이 데이터베이스 하나다.** D11 이 보존 대상을 세 가지로 못박았고
 * (tracker record · 미ACK 측정점 버퍼 · finish intent) 셋이 같은 DB 를 쓴다. 버전과 store
 * 이름을 한 파일에 모아 두는 이유는, 두 모듈이 서로 다른 버전으로 같은 DB 를 열면
 * `VersionError` 로 한쪽이 통째로 실패하기 때문이다.
 *
 * `sessionStorage` · `localStorage` 를 쓰지 않는다 — 탭 종료 · 브라우저 종료 · OS 재부팅을
 * 넘어 살아남아야 하고, D11 이 IndexedDB 하나로 고정했다.
 */

const DB_NAME = "tancheonrun";

/**
 * 2 — #83 이 측정점 버퍼와 finish intent store 를 더했다.
 *
 * 올릴 때는 `upgrade()` 에 **새 store 만 더한다.** 기존 store 를 지우면 진행 중인 러닝의
 * tracker record 가 사라져 그 기기가 writer 자격을 잃는다.
 */
const DB_VERSION = 2;

export const STORES = {
  /** tracker record 한 개(#81). key `"current"`. */
  tracker: "tracker",
  /** 아직 ACK 받지 못한 측정점(#83). keyPath `[sessionId, trackerGeneration, rawSeq]`. */
  points: "points",
  /** 종료 의사(#83 스키마 · #85 가 채운다). keyPath `sessionId`. */
  finishIntent: "finishIntent",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORES.tracker)) {
    db.createObjectStore(STORES.tracker);
  }
  if (!db.objectStoreNames.contains(STORES.points)) {
    db.createObjectStore(STORES.points, {
      keyPath: ["sessionId", "trackerGeneration", "rawSeq"],
    });
  }
  if (!db.objectStoreNames.contains(STORES.finishIntent)) {
    db.createObjectStore(STORES.finishIntent, { keyPath: "sessionId" });
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    // 다른 탭이 옛 버전으로 DB 를 붙들고 있으면 여기서 멈춘다. 매달리지 않고 실패시킨다.
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked"));
  });
}

/** 요청 하나를 돌린다. 트랜잭션은 요청이 끝나면 함께 닫힌다. */
export async function withStore<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();

  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = run(tx.objectStore(store));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * 여러 요청을 **한 트랜잭션 안에서** 돌린다. 트랜잭션이 커밋될 때까지 기다린다.
 *
 * 점을 여러 개 넣거나 지울 때 쓴다 — 하나씩 따로 커밋하면 중간에 탭이 죽었을 때
 * 일부만 남는다.
 */
export async function withTransaction(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => void,
): Promise<void> {
  const db = await openDb();

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, mode);

      run(tx.objectStore(store));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * 여러 store 를 **한 트랜잭션 안에서** 함께 쓴다(#164 · D11 2차).
 *
 * `withTransaction` 은 callback 에 store 하나만 넘겨서 두 store 를 같이 쓸 수 없다. 그렇다고
 * 첫 인자만 배열로 넓혀도 callback 이 나머지 store 를 얻을 방법이 없어, **별도 helper 로 둔다.**
 * 기존 단일-store 호출부는 그대로다.
 *
 * **왜 한 트랜잭션이어야 하나** — `past` 로 영영 거절된 점은 측정점을 tombstone 으로 바꾸고
 * 종료 의사의 `lastRawSeq` 도 함께 낮춰야 하는데, 이 둘을 따로 커밋하면 사이에 탭이 죽었을 때
 * **근거만 있고 종료 번호는 옛 값**이거나 그 반대가 된다. IndexedDB 는 store 여러 개를 한
 * 트랜잭션으로 열 수 있으므로 쪼갤 이유가 없다.
 */
export async function withStoresTransaction(
  stores: readonly StoreName[],
  mode: IDBTransactionMode,
  run: (getStore: (name: StoreName) => IDBObjectStore) => void,
): Promise<void> {
  const db = await openDb();

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...stores], mode);

      run((name) => tx.objectStore(name));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * 저장소가 비워지지 않도록 요청한다(best-effort · D11).
 *
 * **실패하거나 지원하지 않아도 러닝을 실패시키지 않는다.** 저장소 증발은 보장을 걸 수 없는
 * 잔여 위험이고, 그 경우의 해소 경로는 사용자가 「이 기기에서 이어서 측정」으로 인수하는 것이다.
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // 무시한다. 러닝을 막을 이유가 아니다.
  }
}
