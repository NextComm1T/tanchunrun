"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  deleteAckedPoints,
  deleteRunData,
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

type Phase = "working" | "error";

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
   * 아직 서버로 못 올린 점을 먼저 밀어 넣는다. **실패해도 여기서 멈춘다** — `finishRun` 이
   * 부족한 점을 `points_missing` 으로 정확히 알려 주므로, flush 실패를 별도로 판정하지
   * 않는다.
   */
  const flushBuffered = useCallback(
    async (intent: FinishIntent) => {
      for (;;) {
        const buffered = await readBufferedPoints({
          userId,
          sessionId,
          trackerGeneration: intent.trackerGeneration,
        });
        if (buffered.length === 0) return;

        const batch = buffered.slice(0, FLUSH_BATCH);
        const response = await fetch(`/api/runs/${sessionId}/points`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackerToken: intent.trackerToken,
            trackerGeneration: intent.trackerGeneration,
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

        if (!response.ok) return;

        const { ackThroughRawSeq } = (await response.json()) as {
          ackThroughRawSeq: number;
        };
        await deleteAckedPoints({
          userId,
          sessionId,
          trackerGeneration: intent.trackerGeneration,
          ackThroughRawSeq,
        });

        if (buffered.length <= batch.length) return;
      }
    },
    [sessionId, userId],
  );

  /** `active` + 로컬 intent 경로 — flush 후 `finishRun` 을 부른다. */
  const runFromIntent = useCallback(async () => {
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

      await flushBuffered(intent);

      const response = await fetch(`/api/runs/${sessionId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackerToken: intent.trackerToken,
          trackerGeneration: intent.trackerGeneration,
          clientFinishedAt: intent.clientFinishedAt,
          lastRawSeq: intent.lastRawSeq,
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
  }, [router, scheduleRetry, sessionId]);

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
