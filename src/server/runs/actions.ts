"use server";

import { getViewer } from "@/server/auth/session";

import { createRun, findActiveRun, takeoverTracker } from "./session";

/**
 * 러닝 시작 · tracker 인수 server action(#81).
 *
 * 두 함수 모두 userId 를 **인자로 받지 않는다.** `getViewer()` 에서만 얻으므로 남의 세션을
 * 시작하거나 인수할 방법이 없다.
 *
 * 이 파일은 `"use server"` 라서 `import "server-only"` 를 붙이지 않는다.
 */

/** client 가 첫 위치를 확보했다는 증거. 값은 저장하지 않고 **준비 여부 판정에만** 쓴다. */
export type FirstFix = {
  latitude: number;
  longitude: number;
  /** `GeolocationPosition.timestamp`(Unix epoch ms). */
  recordedAt: number;
};

export type StartRunResult =
  | {
      /**
       * 이 러닝의 소유자. client 가 tracker record 에 함께 저장한다(D11) — 같은 기기를
       * 두 사람이 쓸 수 있어서, 복원할 때 현재 로그인한 사람의 것인지 확인해야 한다.
       * **서버가 세션에서 얻은 값을 돌려주는 것이고 client 가 보낸 값이 아니다.**
       */
      userId: string;
      sessionId: string;
      startedAt: string;
      trackerToken: string;
      trackerGeneration: number;
    }
  | { error: "active_exists" | "not_ready" | "failed" };

/**
 * 카운트다운이 끝나는 순간 호출한다.
 *
 * **첫 위치를 확보하지 못했으면 시작하지 않는다**(P1). 화면도 버튼을 막지만 서버가 다시
 * 본다 — UI 비활성을 검증으로 치지 않는다.
 *
 * `firstFix` 좌표는 **저장하지도 로그에 남기지도 않는다.** GPS 점 수집은 #83 의 몫이고,
 * 여기서는 "측위가 됐다" 는 사실만 쓴다.
 *
 * `startedAt` 을 문자열로 돌려주는 이유 — server action 경계를 넘는 `Date` 는 직렬화 형태가
 * 환경에 따라 달라질 수 있어서 ISO 문자열로 고정한다.
 */
export async function startRun(input: {
  firstFix: FirstFix | null;
}): Promise<StartRunResult> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { error: "failed" };
    if (viewer.accountState !== "active") return { error: "failed" };

    if (!isUsableFix(input.firstFix)) return { error: "not_ready" };

    const started = await createRun(viewer.userId);
    if ("error" in started) return { error: started.error };

    return {
      userId: viewer.userId,
      sessionId: started.sessionId,
      startedAt: started.startedAt.toISOString(),
      trackerToken: started.trackerToken,
      trackerGeneration: started.trackerGeneration,
    };
  } catch {
    return { error: "failed" };
  }
}

/** client 가 보낸 값이라 형태를 믿지 않는다. 범위를 벗어난 좌표는 측위로 치지 않는다. */
function isUsableFix(fix: FirstFix | null): boolean {
  if (!fix) return false;

  return (
    Number.isFinite(fix.latitude) &&
    Number.isFinite(fix.longitude) &&
    Math.abs(fix.latitude) <= 90 &&
    Math.abs(fix.longitude) <= 180 &&
    Number.isFinite(fix.recordedAt)
  );
}

export type TakeoverResult =
  | { trackerToken: string; trackerGeneration: number }
  | { error: "not_found" | "failed" };

/**
 * 「이 기기에서 이어서 측정」(D14).
 *
 * **사용자가 명시적으로 고를 때만 부른다.** reload · 재로그인으로 자동 호출하지 않는다 —
 * 그러면 generation 이 계속 올라 원래 tracker 가 영문도 모르고 봉인된다.
 *
 * 인수하면 구 기기가 아직 서버로 올리지 못한 오프라인 버퍼는 유실될 수 있다.
 * 그 사실은 호출 전 확인 UI 가 알린다.
 */
export async function takeoverRun(sessionId: string): Promise<TakeoverResult> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { error: "failed" };

    return await takeoverTracker(viewer.userId, sessionId);
  } catch {
    return { error: "failed" };
  }
}

/** 화면이 자기 진행 중 러닝을 물어볼 때. 없으면 `null`. */
export async function getActiveRun(): Promise<{
  sessionId: string;
  startedAt: string;
  trackerGeneration: number;
} | null> {
  const viewer = await getViewer();
  if (!viewer) return null;

  const active = await findActiveRun(viewer.userId);
  if (!active) return null;

  return {
    sessionId: active.sessionId,
    startedAt: active.startedAt.toISOString(),
    trackerGeneration: active.trackerGeneration,
  };
}
