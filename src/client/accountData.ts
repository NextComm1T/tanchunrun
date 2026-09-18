import { STORES, withTransaction, type StoreName } from "./idb";

/**
 * 탈퇴한 사용자의 기기 durable state 정리(#88 · D11).
 *
 * D11 2차의 **(A) session 전체 durable state 의 permanent cleanup** 세 가지 중 **③ `withdraw()`
 * 성공**이 여기다. 나머지 둘(서버가 `saved` 확인 · permanent 404)은 세션 하나를 지우지만,
 * 탈퇴는 **그 userId 의 durable state 전부**를 지운다 — tracker record · point-stream durable
 * state(측정점 + tombstone) · finish intent 셋 모두, 세션을 가리지 않고.
 *
 * **`signOut()` 성공은 여기 부르는 사유가 아니다**(D11). 로그아웃은 아직 못 보낸 러닝을
 * 버릴 이유가 없고, 다시 로그인하면 이어가야 한다.
 *
 * **다른 사용자의 레코드는 건드리지 않는다.** 같은 기기를 두 사람이 쓸 수 있고, 남은 쪽은
 * 자기 러닝을 이어갈 수 있어야 한다. 그래서 store 를 비우지 않고 `userId` 가 맞는 레코드만
 * 고른다.
 */

/**
 * store 하나를 훑어 소유자가 `userId` 인 레코드만 지운다.
 *
 * 세 store 의 키 모양이 다르다(tracker 는 out-of-line key, points 는 복합 keyPath,
 * finishIntent 는 `sessionId`). 키로 찾지 않고 **cursor 로 값을 보고 지우면** 그 차이를
 * 알 필요가 없고, 키 모양이 바뀌어도 이 함수는 그대로다.
 */
function deleteOwnedRecords(store: IDBObjectStore, userId: string): void {
  const request = store.openCursor();

  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;

    const record = cursor.value as { userId?: unknown } | null;
    if (
      typeof record === "object" &&
      record !== null &&
      record.userId === userId
    ) {
      cursor.delete();
    }

    cursor.continue();
  };
}

/**
 * 탈퇴가 **서버에서 커밋된 뒤에** 부른다.
 *
 * **store 마다 트랜잭션이 따로고, 하나가 실패해도 나머지는 지운다.** (A)③ 이 「해당 userId
 * durable state **전부**」라서, 첫 실패에서 멈추면 뒤 store 를 **시도조차 하지 않아** 계약보다
 * 좁아진다(#171). 옛 구현이 `for...of` + `await` 라 그랬다.
 *
 * **「어차피 안 읽힌다」를 정리한 것으로 치지 않는다.** 남은 레코드가 사라진 userId 의 것이라
 * 아무도 읽지 못하는 것은 맞지만(같은 소셜 계정으로 다시 가입해도 새 UID 라 `userId` 가 맞지
 * 않는다 · P13), 그건 **삭제가 실패했을 때 남는 잔여물의 위험도**를 낮춰 주는 성질이지 D11 의
 * **물리적 삭제 계약을 면제해 주지 않는다.** 두 층을 섞지 않는다 — 계약대로 셋 다 시도하고,
 * 그래도 실패한 것이 있으면 그 사실을 던진다.
 *
 * **던진 실패를 탈퇴 실패로 되돌릴지는 화면이 정한다.** `WithdrawButton` 은 되돌리지 않는다 —
 * 계정은 이미 서버에서 사라져 되돌릴 수 없고, 거기서 막으면 사용자가 지워진 계정으로 설정
 * 화면에 갇힌다.
 */
export async function deleteLocalDataForUser(userId: string): Promise<void> {
  const stores: readonly StoreName[] = [
    STORES.points,
    STORES.finishIntent,
    STORES.tracker,
  ];

  const settled = await Promise.allSettled(
    stores.map((store) =>
      withTransaction(store, "readwrite", (objectStore) =>
        deleteOwnedRecords(objectStore, userId),
      ),
    ),
  );

  const failed = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed) throw failed.reason;
}
