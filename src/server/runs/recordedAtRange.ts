/**
 * `recordedAt` 범위 판정의 순수 규칙(#164 · D11 2차).
 *
 * **`import "server-only"` 를 붙이지 않는다.** `src/server` 의 다른 모듈과 달리 DB · cookie ·
 * `node:` 모듈을 하나도 쓰지 않는 순수 함수라서, 판정이 실제로 맞는지 테스트로 확인할 수
 * 있어야 한다(`server-only` 가 붙으면 Next 밖에서 import 하는 순간 던진다) — `ack.ts` ·
 * `db/sqlstate.ts` 와 같은 이유다. 경계값은 `points.ts` 가 policy 상수로 계산해 넘긴다.
 *
 * **이 판정을 틀리면 비싸다.** `past` 를 `future` 로 보면 client 가 영영 통과하지 못할 점을
 * 계속 재전송하고, `future` 를 `past` 로 보면 **나중에 저장될 수 있는 GPS 점을 영구히 버린다.**
 */

/**
 * 어느 경계를 벗어났는가.
 *
 * - `past` — `started_at` 이 고정이라 **다시 보내도 영영 거절된다(terminal)**
 * - `future` — 서버 시각이 흐르면 통과할 수 있다. **terminal 이 아니라 재시도 가능 실패다**
 */
export type ClockBound = "past" | "future";

/**
 * 이 시각이 받아들일 범위 안인가. 안이면 `null` 이다.
 *
 * **경계값은 범위 안이다** — `earliest` · `latest` 와 같으면 받는다. 허용치가 「이만큼까지
 * 봐준다」는 뜻이라 그 값 자체를 거절하면 client 와 서버의 판정이 1ms 차이로 갈린다.
 */
export function classifyRecordedAt(
  recordedAt: number,
  earliest: number,
  latest: number,
): ClockBound | null {
  if (!Number.isFinite(recordedAt)) return "past";

  if (recordedAt < earliest) return "past";
  if (recordedAt > latest) return "future";

  return null;
}

/**
 * 배치에서 **처음** 범위를 벗어난 점. 없으면 `null`.
 *
 * 하나라도 벗어나면 배치 전체를 거절하므로(부분 저장은 `rawSeq` 를 듬성하게 만든다)
 * 어느 점이 문제인지만 지목하면 된다.
 */
export function firstOutOfRange<P extends { rawSeq: number; recordedAt: number }>(
  points: readonly P[],
  earliest: number,
  latest: number,
): { rawSeq: number; bound: ClockBound } | null {
  for (const point of points) {
    const bound = classifyRecordedAt(point.recordedAt, earliest, latest);
    if (bound) return { rawSeq: point.rawSeq, bound };
  }

  return null;
}
