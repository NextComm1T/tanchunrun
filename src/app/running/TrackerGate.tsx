"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { readFinishIntent, writeFinishIntent } from "@/client/runBuffer";
import { isCurrentTracker, saveTrackerRecord } from "@/client/tracker";
import { takeoverRun } from "@/server/runs/actions";

/**
 * 이 기기가 지금 러닝의 writer 인지 판정하고, 아니면 read-only 로 덮는다(#81 · D14).
 *
 * **서버는 어느 기기가 tracker 인지 모른다.** generation 과 token 해시만 갖고 있고, token 을
 * 가진 쪽이 자기가 writer 임을 안다. 그래서 판정이 client 에서 일어난다.
 *
 * **자동으로 인수하지 않는다.** reload 나 재로그인만으로 generation 이 오르면 원래 측정하던
 * 기기가 영문도 모르고 봉인된다. 사용자가 명시적으로 고를 때만 인수한다.
 *
 * read-only 기기가 고를 수 있는 것은 D14 가 정한 **두 개**다.
 *
 * - **「이 기기에서 이어서 측정」** — 인수해서 이 기기가 writer 가 된다.
 * - **「여기서 종료」**(#116) — 인수한 뒤 **점 0개(`lastRawSeq = 0`)로 끝낸다.** D14 의 「새
 *   generation point 0개 takeover finish」 그대로다. 새 서버 경로를 만들지 않고, 결과 화면이
 *   #85 의 결과 복구로 종료를 마친다. 인수한 token 은 **tracker record 로 저장하지 않는다** —
 *   저장하면 이 기기가 writer 가 되어 GPS 를 켜고 이 기기 위치의 점이 붙을 수 있다.
 *
 * 두 액션 모두 구 기기가 아직 보내지 못한 기록을 잃게 할 수 있어서 그 사실을 화면에 적는다.
 */

type TrackerGateProps = {
  userId: string;
  sessionId: string;
  trackerGeneration: number;
};

/** 판정 전에는 아무것도 단정하지 않는다 — 읽는 동안 read-only 를 깜빡이면 안 된다. */
type Ownership = "checking" | "writer" | "read-only";

type Failure = "takeover" | "finish-here";

const FAILURE_MESSAGE: Record<Failure, string> = {
  takeover: "이어받지 못했습니다. 잠시 후 다시 시도해주세요.",
  "finish-here": "종료하지 못했습니다. 잠시 후 다시 시도해주세요.",
};

export function TrackerGate({
  userId,
  sessionId,
  trackerGeneration,
}: TrackerGateProps) {
  const router = useRouter();

  const [ownership, setOwnership] = useState<Ownership>("checking");
  const [failure, setFailure] = useState<Failure | null>(null);
  /** 「여기서 종료」를 한 번 누른 상태. 러닝이 끝나는 동작이라 바로 실행하지 않고 한 번 더 묻는다. */
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [pending, startTransition] = useTransition();

  /*
    두 액션은 **한 번에 하나만** 돈다. 둘 다 takeover 로 generation 을 올리는데, 연타 등으로 겹치면
    generation 이 두 번 오른 뒤 저장 순서가 뒤바뀔 수 있다 — 그러면 **봉인된 쪽의 token** 이 마지막
    종료 의사로 남아 서버가 영원히 거절한다. `pending` 은 다음 렌더에야 반영되므로 ref 로 즉시 막는다.
  */
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      /*
        **이 기기에 현재 generation 의 종료 의사가 있으면 결과 복구로 보낸다**(P14 · #116).
        종료를 누른 직후 탭이 죽어도 다시 열면 끝내던 일을 이어가야 한다 — `/running` 은
        「종료 처리 중」 안내만 띄울 뿐 결과 화면으로 넘기지 않는다.

        generation 이 **같을 때만** 보낸다. 종료를 누른 뒤 다른 기기가 인수했다면 그 의사는
        봉인된 generation 의 token 이라 서버가 거절하고, 결과 화면은 재시도만 반복한다.
        그때는 read-only 로 두고 사용자가 다시 고르게 한다.
      */
      const intent = await readFinishIntent({ userId, sessionId }).catch(
        () => null,
      );
      if (cancelled) return;
      if (intent && intent.trackerGeneration === trackerGeneration) {
        router.replace(`/result/${sessionId}`);
        return;
      }

      const mine = await isCurrentTracker({
        userId,
        sessionId,
        trackerGeneration,
      }).catch(() => false);

      if (!cancelled) setOwnership(mine ? "writer" : "read-only");
    })();

    return () => {
      cancelled = true;
    };
  }, [router, userId, sessionId, trackerGeneration]);

  function handleTakeover() {
    if (busyRef.current) return;
    busyRef.current = true;
    setFailure(null);

    startTransition(async () => {
      try {
        const result = await takeoverRun(sessionId);

        if ("error" in result) {
          setFailure("takeover");
          return;
        }

        try {
          await saveTrackerRecord({
            userId,
            sessionId,
            trackerToken: result.trackerToken,
            trackerGeneration: result.trackerGeneration,
          });
        } catch {
          // 서버는 이미 generation 을 올렸는데 이 기기가 token 을 저장하지 못했다.
          // 성공으로 보이게 하지 않는다 — 다시 시도하면 generation 이 한 번 더 오른다.
          setFailure("takeover");
          return;
        }

        setOwnership("writer");
        // 새 generation 기준으로 화면을 다시 그린다.
        router.refresh();
      } finally {
        busyRef.current = false;
      }
    });
  }

  function handleFinishHere() {
    if (busyRef.current) return;
    busyRef.current = true;
    setFailure(null);

    // 사용자가 끝내기로 한 시각. 서버가 D13 으로 검증 · clamp 한다.
    const clientFinishedAt = Date.now();

    startTransition(async () => {
      try {
        const result = await takeoverRun(sessionId);

        if ("error" in result) {
          setFailure("finish-here");
          return;
        }

        /*
          종료 의사를 **먼저** durable 하게 남기고 나서 이동한다(D11) — 이동 중에 탭이 죽어도 다시
          열면 위의 판정이 결과 복구로 보낸다. 새 generation 에는 점이 없으므로 `lastRawSeq` 는 0 이다.

          저장에 실패하면 서버 generation 은 이미 올라 구 기기는 봉인됐지만, 이 기기는 record 가 없어
          그대로 read-only 다. 다시 누르면 generation 이 한 번 더 오를 뿐이고 점 0개라 결과에 영향이 없다.
        */
        try {
          await writeFinishIntent({
            userId,
            sessionId,
            trackerToken: result.trackerToken,
            trackerGeneration: result.trackerGeneration,
            clientFinishedAt,
            lastRawSeq: 0,
          });
        } catch {
          setFailure("finish-here");
          return;
        }

        // 결과 화면이 #85 의 결과 복구로 finish 요청 · 실패 A/B · 재시도를 맡는다.
        router.replace(`/result/${sessionId}`);
      } finally {
        busyRef.current = false;
      }
    });
  }

  if (ownership !== "read-only") return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="tracker-gate-title"
      aria-describedby="tracker-gate-desc"
      className="absolute inset-0 z-20 flex items-center justify-center bg-foreground/45 p-6"
    >
      <div className="w-full rounded-2xl bg-surface px-5 py-6 text-center shadow-modal">
        {confirmingFinish ? (
          <>
            <h2 id="tracker-gate-title" className="text-title font-extrabold">
              여기서 러닝을 끝낼까요?
            </h2>
            <p
              id="tracker-gate-desc"
              className="mt-2.5 text-content leading-[1.6] font-medium text-subtle"
            >
              끝낸 러닝은 되돌릴 수 없어요. 다른 기기는 더 이상 기록을 보내지 못하고,
              <strong className="font-bold text-foreground">
                {" "}
                그 기기가 아직 보내지 못한 기록은 저장되지 않을 수 있어요.
              </strong>
            </p>
          </>
        ) : (
          <>
            <h2 id="tracker-gate-title" className="text-title font-extrabold">
              다른 기기에서 진행 중
            </h2>
            <p
              id="tracker-gate-desc"
              className="mt-2.5 text-content leading-[1.6] font-medium text-subtle"
            >
              이 러닝은 다른 기기가 측정하고 있어요. 이 기기에서 이어서 측정하거나
              여기서 종료하면
              <strong className="font-bold text-foreground">
                {" "}
                그 기기가 아직 보내지 못한 기록은 저장되지 않을 수 있어요.
              </strong>
            </p>
          </>
        )}

        {failure ? (
          <p
            role="alert"
            className="mt-4 rounded-md border-[1.5px] border-error-border bg-error-soft px-4 py-3 text-sm font-bold text-error"
          >
            {FAILURE_MESSAGE[failure]}
          </p>
        ) : null}

        {confirmingFinish ? (
          <>
            <button
              type="button"
              onClick={handleFinishHere}
              disabled={pending}
              className="mt-5 h-[52px] w-full rounded-xl bg-danger text-[17px] font-extrabold text-on-primary shadow-danger disabled:opacity-60"
            >
              종료하기
            </button>
            {/*
              끝내는 쪽이 아니라 **취소에 포커스**를 둔다. 확인 단계로 넘어오는 순간 누른 버튼이
              사라져 포커스를 잃고, Enter 한 번으로 바로 끝나지 않게 안전한 쪽에서 시작한다.
            */}
            <button
              type="button"
              autoFocus
              onClick={() => {
                setConfirmingFinish(false);
                setFailure(null);
              }}
              disabled={pending}
              className="mt-2.5 h-[52px] w-full rounded-xl bg-surface-muted text-[17px] font-extrabold text-foreground disabled:opacity-60"
            >
              취소
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleTakeover}
              disabled={pending}
              className="mt-5 h-[52px] w-full rounded-xl bg-primary text-[17px] font-extrabold text-on-primary disabled:opacity-60"
            >
              이 기기에서 이어서 측정
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingFinish(true);
                setFailure(null);
              }}
              disabled={pending}
              className="mt-2.5 h-[52px] w-full rounded-xl border-[1.5px] border-border bg-surface text-[17px] font-extrabold text-danger disabled:opacity-60"
            >
              여기서 종료
            </button>
          </>
        )}
      </div>
    </div>
  );
}
