"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

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
 * 이 PR 에서 read-only 기기가 고를 수 있는 것은 **「이 기기에서 이어서 측정」하나**다.
 * D14 가 함께 정한 「여기서 종료」는 종료 처리(#85)가 있어야 해서 그 PR 이 붙인다.
 */

type TrackerGateProps = {
  userId: string;
  sessionId: string;
  trackerGeneration: number;
};

/** 판정 전에는 아무것도 단정하지 않는다 — 읽는 동안 read-only 를 깜빡이면 안 된다. */
type Ownership = "checking" | "writer" | "read-only";

export function TrackerGate({
  userId,
  sessionId,
  trackerGeneration,
}: TrackerGateProps) {
  const router = useRouter();

  const [ownership, setOwnership] = useState<Ownership>("checking");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
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
  }, [userId, sessionId, trackerGeneration]);

  function handleTakeover() {
    setFailed(false);

    startTransition(async () => {
      const result = await takeoverRun(sessionId);

      if ("error" in result) {
        setFailed(true);
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
        setFailed(true);
        return;
      }

      setOwnership("writer");
      // 새 generation 기준으로 화면을 다시 그린다.
      router.refresh();
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
        <h2 id="tracker-gate-title" className="text-title font-extrabold">
          다른 기기에서 진행 중
        </h2>
        <p
          id="tracker-gate-desc"
          className="mt-2.5 text-content leading-[1.6] font-medium text-subtle"
        >
          이 러닝은 다른 기기가 측정하고 있어요. 이 기기에서 이어서 측정하면
          <strong className="font-bold text-foreground">
            {" "}
            그 기기가 아직 보내지 못한 기록은 저장되지 않을 수 있어요.
          </strong>
        </p>

        {failed ? (
          <p
            role="alert"
            className="mt-4 rounded-md border-[1.5px] border-error-border bg-error-soft px-4 py-3 text-sm font-bold text-error"
          >
            이어받지 못했습니다. 잠시 후 다시 시도해주세요.
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleTakeover}
          disabled={pending}
          className="mt-5 h-[52px] w-full rounded-xl bg-primary text-[17px] font-extrabold text-on-primary disabled:opacity-60"
        >
          이 기기에서 이어서 측정
        </button>
      </div>
    </div>
  );
}
