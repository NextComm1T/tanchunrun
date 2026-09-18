"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  deleteAckedPoints,
  deleteRunData,
  finishLastRawSeq,
  markTerminalRawSeq,
  readBufferedPoints,
  readFinishIntent,
  type FinishIntent,
} from "@/client/runBuffer";

/**
 * 결과 화면의 recovery gate(#85 · D11 · D14 · P14).
 *
 * server component(`page.tsx`)가 이미 `getResult` 로 알아낸 상태를 그대로 받는다 — 여기서
 * 다시 서버에 상태를 묻지 않는다. **`active` 는 이 기기의 로컬 종료 intent 유무로 갈린다**
 * (D14) — intent 가 있으면 이 기기가 종료를 눌렀던 기기라 저장을 이어가고, 없으면 다른
 * 기기 · 직접 URL 접근이라 `/running` 으로 보낸다.
 *
 * `finalization_pending` · `finalization_failed` 는 이미 `finished` 인 세션의 tx2 재시도
 * (`retryFinalization`)다.
 *
 * **재시도는 한 번에 하나만 돈다.** 진입점이 마운트 · `online` · 백오프 타이머 ·
 * 「다시 시도」 버튼 넷이라 그냥 두면 겹친다(`inFlightRef` · `restart`).
 */

type ResultRecoveryGateProps = {
  userId: string;
  sessionId: string;
  serverState: "active" | "finalization_pending" | "finalization_failed";
};

/**
 * `superseded` 는 **재시도 불가**다. 다른 둘과 달리 백오프를 걸지 않는다 — 서버가 이 기기의
 * 종료 의사를 다시 받는 일이 없어서(#150 · D14) 재시도는 실패를 반복하는 것뿐이다.
 */
type Phase = "working" | "error" | "superseded";

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
/** 한 번에 flush 할 점 수. running 화면의 초기 batch(#83)와 같은 값이다. */
const FLUSH_BATCH = 200;

function backoffMs(attempt: number): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.round(base * (0.5 + Math.random() * 0.5));
}

export function ResultRecoveryGate({
  userId,
  sessionId,
  serverState,
}: ResultRecoveryGateProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("working");
  const [message, setMessage] = useState("저장하는 중이에요…");
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  /**
   * 재시도 진입점이 넷이다 — 마운트 · `online` 이벤트 · 백오프 타이머 · 「다시 시도」 버튼.
   * 겹쳐 돌면 같은 IndexedDB 버퍼를 교차로 읽고 지우면서 같은 점을 두 번 올리고,
   * `points` · `finish` bucket 을 두 번 쓴다(#83 D11). 그래서 **한 번에 하나만** 돌게 막는다.
   * dev StrictMode 의 이중 마운트도 여기서 걸린다.
   */
  const inFlightRef = useRef(false);
  /**
   * 봉인된 generation 이라 서버가 이 종료 의사를 영영 받지 않는다(#150). 한 번 확인하면
   * 래치한다 — 그러지 않으면 `online` 이벤트가 같은 요청을 다시 보내 실패를 반복한다.
   */
  const terminalRef = useRef(false);

  useEffect(() => {
    // dev StrictMode 는 mount → cleanup → mount 로 돈다. 여기서 다시 true 로 돌려놓지
    // 않으면 첫 cleanup 이 남긴 false 가 그대로 남아, 이후 모든 `mountedRef` 가드가
    // 조기 return 하고 오류 UI 와 재시도 예약이 dev 에서 통째로 죽는다.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const scheduleRetry = useCallback((run: () => void, explicitMs?: number) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    const delay = explicitMs ?? backoffMs(attemptRef.current++);
    timerRef.current = setTimeout(run, delay);
  }, []);

  /**
   * flush 결과. 종료로 넘어가도 되는지를 **호출부가 헷갈리지 않게** 한 값으로 말한다.
   *
   * - `ready` — 더 밀 것이 없거나, 남은 실패는 `finishRun` 이 정확히 알려 줄 종류다
   * - `deferred` — 서버 시각이 아직 따라오지 않았다(`bound = future`). **이번 회차에는 종료를
   *   부르지 않는다** — 불러 봐야 `points_missing` 을 받고 finish bucket 만 쓴다
   */
  type FlushResult =
    | { kind: "ready"; intent: FinishIntent }
    | { kind: "deferred"; intent: FinishIntent };

  /**
   * 아직 서버로 못 올린 점을 먼저 밀어 넣는다. **실패해도 여기서 멈춘다** — `finishRun` 이
   * 부족한 점을 `points_missing` 으로 정확히 알려 주므로, flush 실패를 별도로 판정하지
   * 않는다.
   *
   * 예외가 둘 있다(#145 · #164 · D11 2차). 서버가 시각 범위 밖이라고 돌려준 점인데, **경계마다
   * 성질이 다르다.**
   *
   * - `past` — `started_at` 이 고정이라 다시 보내도 영영 거절된다. 그 점을 **tombstone 으로
   *   바꾸고 종료 의사의 `lastRawSeq` 도 빈 자리 앞까지 낮춘다. 둘을 한 트랜잭션에서** 쓴다 —
   *   따로 커밋하면 사이에 탭이 죽었을 때 근거와 번호가 어긋난다
   * - `future` — 서버 시각이 흐르면 통과할 수 있다. **점을 버리지 않고 intent 도 건드리지 않으며**
   *   `deferred` 로 빠져 상위 백오프에 맡긴다
   *
   * 갱신된 intent 를 돌려주므로 호출부는 **그 값으로** 종료를 요청한다.
   */
  const flushBuffered = useCallback(
    async (intent: FinishIntent): Promise<FlushResult> => {
      let current = intent;

      for (;;) {
        const buffered = await readBufferedPoints({
          userId,
          sessionId,
          trackerGeneration: current.trackerGeneration,
        });
        if (buffered.length === 0) return { kind: "ready", intent: current };

        const batch = buffered.slice(0, FLUSH_BATCH);
        const response = await fetch(`/api/runs/${sessionId}/points`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackerToken: current.trackerToken,
            trackerGeneration: current.trackerGeneration,
            points: batch.map((point) => ({
              rawSeq: point.rawSeq,
              segment: point.segment,
              lat: point.lat,
              lng: point.lng,
              recordedAt: point.recordedAt,
              accuracy: point.accuracy,
            })),
          }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
            rawSeq?: number;
            /** `invalid_recorded_at` 일 때만 온다(D11 2차). 없으면 terminal 로 보지 않는다. */
            bound?: "past" | "future";
          } | null;

          if (
            body?.error === "invalid_recorded_at" &&
            typeof body.rawSeq === "number"
          ) {
            if (body.bound === "future") {
              return { kind: "deferred", intent: current };
            }

            const lastRawSeq = finishLastRawSeq(current.lastRawSeq + 1, [
              body.rawSeq,
            ]);
            const lowered =
              lastRawSeq === current.lastRawSeq
                ? undefined
                : { ...current, lastRawSeq };

            /*
              빈 자리 표시와 낮춘 종료 번호를 **한 번에** 쓴다(#164). 나눠 쓰면 그 사이에 탭이
              죽었을 때 한쪽만 남아, 다시 열었을 때 근거 없이 낮아진 번호를 믿거나 근거를 두고도
              옛 번호로 종료를 시도하게 된다.
            */
            await markTerminalRawSeq({
              userId,
              sessionId,
              trackerGeneration: current.trackerGeneration,
              rawSeq: body.rawSeq,
              finishIntent: lowered,
            });

            if (lowered) current = lowered;
            continue;
          }

          return { kind: "ready", intent: current };
        }

        const { ackThroughRawSeq } = (await response.json()) as {
          ackThroughRawSeq: number;
        };
        await deleteAckedPoints({
          userId,
          sessionId,
          trackerGeneration: current.trackerGeneration,
          ackThroughRawSeq,
        });

        if (buffered.length <= batch.length) {
          return { kind: "ready", intent: current };
        }
      }
    },
    [sessionId, userId],
  );

  /** `active` + 로컬 intent 경로 — flush 후 `finishRun` 을 부른다. */
  const runFromIntent = useCallback(async () => {
    if (terminalRef.current) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const intent = await readFinishIntent({ userId, sessionId }).catch(
        () => null,
      );
      if (!intent) {
        // 다른 기기 · 직접 URL 접근이다(D14). 이 기기는 종료 intent 가 없다.
        router.replace("/running");
        return;
      }

      setPhase("working");
      setMessage("저장하는 중이에요…");

      // flush 중에 영영 거절당한 점이 나오면 `lastRawSeq` 가 낮아진 intent 가 돌아온다(#145).
      const flushed = await flushBuffered(intent);

      /*
        아직 서버 시각이 따라오지 않았다(`bound = future` · #164). **종료를 부르지 않고** 물러난다 —
        지금 부르면 `points_missing` 을 받고 finish bucket 만 쓴다. 기기 시계가 앞선 것뿐이라
        시간이 지나면 같은 점이 그대로 올라간다.
      */
      if (flushed.kind === "deferred") {
        if (!mountedRef.current) return;
        setPhase("error");
        setMessage("아직 저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.");
        scheduleRetry(() => void runFromIntent());
        return;
      }

      const response = await fetch(`/api/runs/${sessionId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackerToken: flushed.intent.trackerToken,
          trackerGeneration: flushed.intent.trackerGeneration,
          clientFinishedAt: flushed.intent.clientFinishedAt,
          lastRawSeq: flushed.intent.lastRawSeq,
        }),
      });

      if (response.ok) {
        const { state } = (await response.json()) as {
          state: "saved" | "finalization_failed";
        };
        if (state === "saved") {
          // 서버가 saved 를 확인한 뒤에만 지운다(D11) — 그 전에는 재시도 대상이다.
          await deleteRunData({
            userId,
            sessionId,
            trackerGeneration: intent.trackerGeneration,
          }).catch(() => undefined);
          attemptRef.current = 0;
          router.refresh();
          return;
        }
        throw new Error("finalization_failed");
      }

      /*
        이 기기의 종료 의사는 **봉인된 generation** 의 것이다(#150 · D14). 다른 기기가 인수
        (409 `tracker_superseded`)했거나 종료(403 `not_tracker`)해서 서버는 이 종료 의사를 다시
        받지 않는다. 재시도해도 영영 성공하지 않으므로 **백오프를 멈추고** 안내로 바꾼다 — 그냥
        두면 「저장하지 못했어요 · 다시 시도」만 끝없이 반복한다.

        **상태 코드가 아니라 `error` 로 가른다.** 같은 409 인 `points_missing` 과 같은 403 인
        `forbidden_origin` 은 성질이 달라 지금처럼 재시도 대상으로 둔다.

        `500 failed` 도 여기 넣지 않는다 — 서버에 닿지 못한 경우(실패 A)가 아래 catch 로 같은
        안내에 닿는데, 이것까지 영구 실패로 막으면 연결이 돌아왔을 때의 정상 복구가 죽는다.
        종료와 인수가 정확히 겹쳐 500 이 나오는 좁은 구간은 서버 쪽 #149 가 본다.

        **버퍼와 종료 의사는 지우지 않는다.** D11 2차가 정한 삭제 사유는 `saved` 확인 ·
        permanent 404 · `withdraw()` 셋뿐이고, 인수는 그중 어느 것도 아니다.
      */
      if (response.status === 409 || response.status === 403) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        if (
          body?.error === "tracker_superseded" ||
          body?.error === "not_tracker"
        ) {
          terminalRef.current = true;
          if (!mountedRef.current) return;
          setPhase("superseded");
          return;
        }
      }

      if (response.status === 429) {
        const retryAfterSec = Number(response.headers.get("Retry-After"));
        if (!mountedRef.current) return;
        setPhase("error");
        setMessage("서버가 바빠요. 잠시 후 다시 시도할게요.");
        scheduleRetry(
          () => void runFromIntent(),
          Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? retryAfterSec * 1000
            : undefined,
        );
        return;
      }

      throw new Error("finish_failed");
    } catch {
      if (!mountedRef.current) return;
      setPhase("error");
      setMessage("아직 저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.");
      scheduleRetry(() => void runFromIntent());
    } finally {
      inFlightRef.current = false;
    }
  }, [flushBuffered, router, scheduleRetry, sessionId, userId]);

  /** `finalization_pending` · `finalization_failed` 경로 — tx2 만 다시 시도한다. */
  const runRetryFinalization = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setPhase("working");
    setMessage("저장하는 중이에요…");

    try {
      const response = await fetch(`/api/runs/${sessionId}/retry`, { method: "POST" });

      if (response.ok) {
        const { state } = (await response.json()) as {
          state: "saved" | "finalization_failed";
        };
        if (state === "saved") {
          router.refresh();
          return;
        }
        throw new Error("finalization_failed");
      }

      /*
        `404 not_found` 는 **다시 해도 결과가 같다**(#192). 서버가 이 응답을 주는 조건은 세션이
        없거나 이미 `saved` 인 경우다(`retryFinalization`) — 어느 쪽이든 이 기기가 tx2 를 다시
        불러 성공할 일이 없다. 그래서 백오프를 멈춘다. 그냥 두면 이미 저장된 러닝을 두고
        「아직 저장하지 못했어요」를 띄운 채 영원히 재시도한다.

        permanent 404 는 D11 2차가 정한 (A) permanent cleanup 사유 ②다. 세션 전체 로컬 자취를
        지우고 나서 서버에 다시 묻는다.

        **어느 쪽 404 인지 화면이 가려내지 않는다.** `router.refresh()` 가 server component 를
        다시 돌리므로 저장됐으면 결과가 그려지고, 세션이 없으면 `page.tsx` 가 `notFound()` 한다.
      */
      if (response.status === 404) {
        // 정리가 실패해도 `refresh` 는 한다(:266 과 같은 처분) — 로컬 삭제 실패로 사용자를 이
        // 화면에 가두지 않는다. 서버는 이미 이 세션의 tx2 를 받지 않는다.
        await deleteRunData({ userId, sessionId }).catch(() => undefined);
        router.refresh();
        return;
      }

      if (response.status === 429) {
        const retryAfterSec = Number(response.headers.get("Retry-After"));
        if (!mountedRef.current) return;
        setPhase("error");
        setMessage("서버가 바빠요. 잠시 후 다시 시도할게요.");
        scheduleRetry(
          () => void runRetryFinalization(),
          Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? retryAfterSec * 1000
            : undefined,
        );
        return;
      }

      throw new Error("retry_failed");
    } catch {
      if (!mountedRef.current) return;
      setPhase("error");
      setMessage("아직 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
      scheduleRetry(() => void runRetryFinalization());
    } finally {
      inFlightRef.current = false;
    }
  }, [router, scheduleRetry, sessionId, userId]);

  const run = serverState === "active" ? runFromIntent : runRetryFinalization;

  /**
   * 사용자의 「다시 시도」와 `online` 이벤트가 **같은 경로**를 타게 한다.
   *
   * 예약된 백오프 타이머를 먼저 끄는 것이 핵심이다 — 끄지 않으면 지금 시작한 것과 별개로
   * 나중에 타이머가 또 발사되고, 실패할 때마다 다시 예약돼 재시도 체인이 늘어난다.
   */
  const restart = useCallback(() => {
    attemptRef.current = 0;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void run();
  }, [run]);

  // 마운트 시 한 번 시작한다. `run` 은 매 렌더 새로 만들어지지만 의존값이 바뀌지 않는 한
  // 같은 동작이라 재실행할 필요가 없다.
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 연결이 돌아오면 바로 다시 시도한다(D11 · P14).
  useEffect(() => {
    window.addEventListener("online", restart);
    return () => window.removeEventListener("online", restart);
  }, [restart]);

  /*
    다음 행동은 `/` 다(#148 과 같은 선택이다). **인수와 종료를 화면이 구분하지 않는다** — 서버가
    돌려준 두 error 는 사용자에게 「이 기기에서는 더 저장할 수 없다」 하나이고, 러닝이 아직 도는지는
    루트 분기가 안다. 끝났으면 `/home`, 아직이면 `/running` 의 `TrackerGate` 가 두 액션을 준다.
  */
  if (phase === "superseded") {
    return (
      <div
        role="alert"
        className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center"
      >
        <p className="text-content font-extrabold text-foreground">
          이 기기에서는 저장을 마칠 수 없어요
        </p>
        <p className="text-note leading-[1.6] font-medium text-subtle">
          다른 기기가 이 러닝을 이어받았거나 이미 종료했어요. 지금까지 서버에 보낸
          기록은 그대로 남아 있어요.
        </p>
        <Link
          href="/"
          className="mt-1 flex h-[52px] items-center justify-center rounded-xl bg-primary px-6 text-[17px] font-extrabold text-on-primary"
        >
          현재 상태 확인
        </Link>
      </div>
    );
  }

  return (
    <div
      role={phase === "error" ? "alert" : "status"}
      className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center"
    >
      <p
        className={`text-content font-bold ${
          phase === "error" ? "text-error" : "text-subtle"
        }`}
      >
        {message}
      </p>

      {phase === "error" ? (
        <button
          type="button"
          onClick={restart}
          className="h-[52px] rounded-xl bg-primary px-6 text-[17px] font-extrabold text-on-primary"
        >
          다시 시도
        </button>
      ) : null}
    </div>
  );
}
