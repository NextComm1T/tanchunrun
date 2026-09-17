"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  bufferPoints,
  deleteAckedPoints,
  deleteBufferedPoint,
  maxBufferedRawSeq,
  readBufferedPoints,
  finishLastRawSeq,
  readFinishIntent,
  writeFinishIntent,
  type BufferedPoint,
} from "@/client/runBuffer";
import { readTrackerRecord, requestPersistentStorage } from "@/client/tracker";
import {
  GPS_WARNING_AFTER_MS,
  classifyFix,
  currentPace,
  isWithinRunStart,
  measure,
  resolveSegment,
  type LastAccepted,
  type RawPoint,
  type RoutePoint,
} from "@/domain/measure";

/**
 * 러닝 실측 runtime(#83 · D1 · D10 · D11 · D14).
 *
 * **계산은 하지 않는다.** 거리 · Zone · 페이스는 전부 `src/domain/measure`(#82)가 낸다.
 * 여기가 맡는 것은 watch · 타이머 · gap pending 상태 보관 · 버퍼 · 업로드다.
 *
 * ## 끊김을 만드는 것과 만들지 않는 것(D10)
 *
 * `POSITION_UNAVAILABLE` · `TIMEOUT` · `PERMISSION_DENIED` · 못 쓸 fix 는 **관측 즉시**
 * gap pending 이다. 반면 **callback 이 조용한 것만으로는 끊김이 아니다** — 가만히 서 있으면
 * 브라우저가 새 fix 를 주지 않는데 그걸 유실로 보면 정지할 때마다 경고가 뜬다. 긴 무수신은
 * 다음 accept 에서 `resolveSegment` 가 뒤늦게 segment 를 끊는다.
 *
 * ## 화면이 숨으면 측정하지 않는다(D1 — Web-only)
 *
 * `hidden` 이 되면 watch 를 정리하고 **platform gap** 으로 전환한다. 브라우저가 백그라운드
 * 측정을 보장하지 않으므로 가능한 척하지 않는다. 숨어 있던 구간은 거리 · 경로에 이어 붙이지
 * 않고, 그동안 P3 경고를 새로 띄우지도 않는다. 경과 시간만은 서버 `started_at` 기준이라
 * 숨은 시간을 포함한다.
 */

export type TrackerStatus =
  /** 판정 중. 아직 아무것도 단정하지 않는다. */
  | "starting"
  /** 이 기기가 writer 이고 watch 가 돌고 있다. */
  | "tracking"
  /** 신호를 잃었거나 화면이 숨었다. 수치 · 핀을 고정한다. */
  | "gap"
  /** 위치 권한이 거부됐다. watch 를 정리했고 재허용하면 다시 시작한다. */
  | "permission-denied"
  /** 종료 의사가 이미 남아 있다. 측정하지 않고 결과 복구로 넘긴다(#85). */
  | "finish-pending"
  /** 이 기기는 writer 가 아니다(D14). `TrackerGate` 가 화면을 덮는다. */
  | "read-only";

export type UploadStatus =
  | "idle"
  /** 네트워크가 없거나 서버가 응답하지 않는다. 버퍼를 지우지 않고 재시도한다. */
  | "offline"
  /** 401 · 미인증. **offline 과 같은 재시도 가능 실패다** — 측정을 멈추지 않는다. */
  | "auth-expired"
  /** 서버가 자원 보호로 막았다. 백오프 후 재시도한다. */
  | "rate-limited"
  /** 같은 키에 다른 좌표가 이미 있다. 그 점만 격리하고 계속 간다. */
  | "conflict";

export type RunTrackerView = {
  status: TrackerStatus;
  /** gap 이 2초 이상 이어졌다(P3). platform gap 에서는 켜지 않는다. */
  gpsWarning: boolean;
  uploadStatus: UploadStatus;
  routePoints: RoutePoint[];
  totalDistanceM: number;
  tancheonDistanceM: number;
  currentPaceSecPerKm: number | null;
  /** 현재 위치가 Ranking Zone 안인가. 신호를 잃은 동안에는 마지막 판정을 유지한다. */
  inZone: boolean;
  marker: { lat: number; lng: number } | null;
  /**
   * 종료 슬라이드가 끝까지 밀렸을 때 부른다(#85 · D11). 측정을 즉시 멈추고 종료 intent를
   * IndexedDB 에 남긴다 — 서버 전달과 결과 화면 이동은 호출부(`SlideToFinish`) 몫이다.
   */
  finish: (clientFinishedAt: number) => Promise<void>;
};

type UseRunTrackerInput = {
  userId: string;
  sessionId: string;
  trackerGeneration: number;
  /** 서버 시각(ISO). 현재 페이스의 「시작 후 15초」 판정에 쓴다. */
  startedAt: string;
  /** 서버가 이미 받은 측정점. 로컬 버퍼와 합쳐 복원한다. */
  serverPoints: readonly RawPoint[];
};

/** 한 번에 보낼 점 수. 413 을 받으면 절반으로 줄인다 — 점을 버리지는 않는다. */
const INITIAL_BATCH = 200;
const MIN_BATCH = 1;

/** 재시도 백오프. jitter 를 섞어 여러 기기가 같은 순간에 몰리지 않게 한다. */
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 60_000;

/** 현재 페이스를 다시 그리는 주기. 경과 시간(`RunStatusBar`)과 같은 1초다. */
const PACE_TICK_MS = 1000;

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  // `timeout` 은 지정하지 않는다(D10) — 정지 중 무수신을 TIMEOUT 오류로 바꿔 버린다.
};

function backoffMs(attempt: number): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.round(base * (0.5 + Math.random() * 0.5));
}

/**
 * 버퍼 레코드를 계산 입력으로 바꾼다.
 *
 * 버퍼는 서버로 보낼 형태라 `accuracy` 가 `null` 이고(DB 컬럼이 nullable) 계산 쪽은
 * `undefined` 를 쓴다. 두 표현을 섞지 않도록 경계에서 한 번만 맞춘다.
 */
function toRawPoint(point: BufferedPoint): RawPoint {
  return {
    trackerGeneration: point.trackerGeneration,
    rawSeq: point.rawSeq,
    segment: point.segment,
    lat: point.lat,
    lng: point.lng,
    recordedAt: point.recordedAt,
    accuracy: point.accuracy ?? undefined,
  };
}

/** 서버 점과 버퍼 점을 합친다. 같은 `rawSeq` 는 **서버 것이 이긴다**(이미 확정된 값이다). */
function mergeByRawSeq(
  serverPoints: readonly RawPoint[],
  buffered: readonly RawPoint[],
): RawPoint[] {
  const merged = new Map<number, RawPoint>();

  for (const point of buffered) merged.set(point.rawSeq, point);
  for (const point of serverPoints) merged.set(point.rawSeq, point);

  return [...merged.values()].sort((a, b) => a.rawSeq - b.rawSeq);
}

export function useRunTracker({
  userId,
  sessionId,
  trackerGeneration,
  startedAt,
  serverPoints,
}: UseRunTrackerInput): RunTrackerView {
  const [status, setStatus] = useState<TrackerStatus>("starting");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [gpsWarning, setGpsWarning] = useState(false);
  const [points, setPoints] = useState<RawPoint[]>([]);
  const [paceTick, setPaceTick] = useState(() => Date.now());

  /** 서버가 정한 시작 시각(epoch ms). fix 판정(#145)과 페이스가 같은 값을 본다. */
  const startedAtMs = useMemo(() => new Date(startedAt).getTime(), [startedAt]);

  /*
    측정 중에 바뀌지만 렌더를 일으키면 안 되는 값들. state 로 두면 fix 하나마다 렌더가
    여러 번 돌고, watch callback 이 낡은 값을 보게 된다.
  */
  const watchIdRef = useRef<number | null>(null);
  const lastAcceptedRef = useRef<LastAccepted | null>(null);
  const nextRawSeqRef = useRef(1);
  const gapPendingRef = useRef(false);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const flushingRef = useRef(false);
  const batchSizeRef = useRef(INITIAL_BATCH);
  const attemptRef = useRef(0);
  /**
   * 서버가 끝내 받지 않아 버린 번호(#145). 종료 때 어디까지를 「빠짐없이 올렸다」고 말할지
   * 이 값이 정한다 — 빈 자리를 그대로 두고 종료하면 서버가 영영 `points_missing` 을 돌려준다.
   */
  const droppedRawSeqsRef = useRef<number[]>([]);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const stoppedRef = useRef(false);

  /** 서버 점은 첫 렌더의 값만 쓴다. 배열이 새로 와도 watch 를 다시 시작하지 않는다. */
  const serverPointsRef = useRef(serverPoints);

  // ── watch 정리 ────────────────────────────────────────────────────────────
  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // ── gap · 경고 ────────────────────────────────────────────────────────────
  const clearWarningTimer = useCallback(() => {
    if (warningTimerRef.current !== null) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
  }, []);

  /**
   * 끊김으로 전환한다.
   *
   * `platform` 은 화면이 숨어서 생긴 gap 이다(D1) — 사용자가 알고 한 일이라 경고를
   * 띄우지 않는다. 표시 중이던 경고도 내린다.
   */
  const enterGap = useCallback(
    (kind: "signal" | "platform") => {
      gapPendingRef.current = true;
      setStatus((current) =>
        current === "permission-denied" || current === "read-only"
          ? current
          : "gap",
      );

      if (kind === "platform") {
        clearWarningTimer();
        setGpsWarning(false);
        return;
      }

      if (warningTimerRef.current === null) {
        warningTimerRef.current = setTimeout(
          () => setGpsWarning(true),
          GPS_WARNING_AFTER_MS,
        );
      }
    },
    [clearWarningTimer],
  );

  const leaveGap = useCallback(() => {
    clearWarningTimer();
    setGpsWarning(false);
    setStatus("tracking");
  }, [clearWarningTimer]);

  // ── 업로드 ────────────────────────────────────────────────────────────────
  const scheduleFlush = useCallback((delayMs: number) => {
    if (stoppedRef.current) return;
    if (flushTimerRef.current !== null) clearTimeout(flushTimerRef.current);

    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      void flushRef.current?.();
    }, delayMs);
  }, []);

  /**
   * 버퍼를 한 배치씩 올린다.
   *
   * **실패해도 버퍼를 지우지 않는다.** 지우는 것은 ACK 된 연속 구간뿐이고, 그 판정은
   * 서버의 `ackThroughRawSeq` 가 한다. 인증 만료 · 429 · 오프라인은 전부 재시도 가능한
   * 실패라 측정을 멈추지 않는다.
   */
  const flush = useCallback(async () => {
    if (flushingRef.current || stoppedRef.current) return;
    flushingRef.current = true;

    try {
      const buffered = await readBufferedPoints({
        userId,
        sessionId,
        trackerGeneration,
      });
      if (buffered.length === 0) {
        attemptRef.current = 0;
        setUploadStatus("idle");
        return;
      }

      const record = await readTrackerRecord(userId);
      if (!record || record.trackerGeneration !== trackerGeneration) {
        // 다른 기기가 인수해 갔다. 올릴 자격이 없으므로 멈춘다(D14). 버퍼는 남긴다.
        setStatus("read-only");
        stopWatch();
        return;
      }

      const batch = buffered.slice(0, batchSizeRef.current);
      const response = await fetch(`/api/runs/${sessionId}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackerToken: record.trackerToken,
          trackerGeneration,
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

      if (response.ok) {
        const { ackThroughRawSeq } = (await response.json()) as {
          ackThroughRawSeq: number;
        };
        await deleteAckedPoints({
          userId,
          sessionId,
          trackerGeneration,
          ackThroughRawSeq,
        });

        attemptRef.current = 0;
        batchSizeRef.current = INITIAL_BATCH;
        setUploadStatus("idle");
        // 남은 것이 있으면 바로 이어서 보낸다.
        if (buffered.length > batch.length) scheduleFlush(0);
        return;
      }

      // 크기를 줄여 다시 보낸다. **점을 버리지 않는다.**
      if (response.status === 413) {
        batchSizeRef.current = Math.max(
          MIN_BATCH,
          Math.floor(batchSizeRef.current / 2),
        );
        scheduleFlush(0);
        return;
      }

      if (response.status === 401) {
        setUploadStatus("auth-expired");
        scheduleFlush(backoffMs(attemptRef.current++));
        return;
      }

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        setUploadStatus("rate-limited");
        scheduleFlush(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(BACKOFF_MAX_MS, retryAfter * 1000)
            : backoffMs(attemptRef.current++),
        );
        return;
      }

      const body = (await response.json().catch(() => null)) as {
        error?: string;
        rawSeq?: number;
      } | null;

      if (
        body?.error === "tracker_superseded" ||
        body?.error === "not_tracker"
      ) {
        // 더 올릴 자격이 없다. 버퍼는 남겨 둔다 — 삭제 사유가 아니다(D11).
        setStatus("read-only");
        stopWatch();
        return;
      }

      /*
        서버가 시각 범위 밖이라고 돌려준 점(#145). 다시 보내도 영영 거절당하므로 **그 점만**
        빼고 계속 간다 — 같은 배치를 무한히 재시도하면 뒤의 점도 하나도 올라가지 못한다.

        빠진 번호는 기억해 뒀다가 종료 때 `lastRawSeq` 를 그 앞까지로 보낸다. 그러지 않으면
        서버의 완전성 검사가 영영 `points_missing` 이 된다.
      */
      if (
        body?.error === "invalid_recorded_at" &&
        typeof body.rawSeq === "number"
      ) {
        droppedRawSeqsRef.current = [
          ...droppedRawSeqsRef.current,
          body.rawSeq,
        ];
        await deleteBufferedPoint({
          sessionId,
          trackerGeneration,
          rawSeq: body.rawSeq,
        });
        setUploadStatus("conflict");
        scheduleFlush(0);
        return;
      }

      if (body?.error === "point_conflict" && typeof body.rawSeq === "number") {
        /*
          같은 키에 다른 좌표가 이미 서버에 있다. **그 점만** 빼고 계속 간다 — 다시 보내도
          영영 거절당하기 때문이다. 사용자를 막지 않고, 좌표는 기록하지 않는다.
        */
        await deleteBufferedPoint({
          sessionId,
          trackerGeneration,
          rawSeq: body.rawSeq,
        });
        setUploadStatus("conflict");
        scheduleFlush(0);
        return;
      }

      setUploadStatus("offline");
      scheduleFlush(backoffMs(attemptRef.current++));
    } catch {
      // fetch 자체가 실패했다(오프라인 등). 버퍼를 지우지 않고 다시 시도한다(P14).
      setUploadStatus("offline");
      scheduleFlush(backoffMs(attemptRef.current++));
    } finally {
      flushingRef.current = false;
    }
  }, [scheduleFlush, sessionId, stopWatch, trackerGeneration, userId]);

  /*
    타이머 callback 이 항상 최신 `flush` 를 부르게 한다. `scheduleFlush` 가 `flush` 를 직접
    닫아 버리면 배치 크기 · 재시도 횟수가 낡은 값으로 굳는다.
  */
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // ── fix 처리 ──────────────────────────────────────────────────────────────
  const handleFix = useCallback(
    (position: GeolocationPosition) => {
      const fix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        recordedAt: position.timestamp,
      };

      /*
        이 러닝의 것으로 볼 수 없는 시각이면 **번호를 부여하지 않는다**(#145).

        OS 가 시작 직전에 잡아 둔 fix 를 그대로 주는 일이 흔한데(Core Location 의 캐시 ·
        Android 의 마지막 위치), 그런 점에 번호를 주면 서버가 `invalid_recorded_at` 으로
        거절하고 그 번호가 빈 자리로 남아 업로드 · 종료가 통째로 막힌다. 허용치는 서버와
        같은 값을 쓴다 — 여기서 통과한 점은 서버도 받는다.
      */
      if (!isWithinRunStart(fix.recordedAt, startedAtMs)) {
        enterGap("signal");
        return;
      }

      const verdict = classifyFix(lastAcceptedRef.current, fix);

      if (verdict === "unusable") {
        enterGap("signal");
        return;
      }
      // downsample · duplicate 는 버리고 **상태를 바꾸지 않는다**(D10).
      if (verdict !== "accept") return;

      const segment = resolveSegment(
        lastAcceptedRef.current,
        fix,
        gapPendingRef.current,
      );

      const point: RawPoint = {
        trackerGeneration,
        rawSeq: nextRawSeqRef.current++,
        segment,
        lat: fix.lat,
        lng: fix.lng,
        recordedAt: fix.recordedAt,
        accuracy: fix.accuracy,
      };

      lastAcceptedRef.current = { recordedAt: fix.recordedAt, segment };
      gapPendingRef.current = false;
      leaveGap();

      setPoints((current) => [...current, point]);

      // 화면보다 먼저 durable 하게 남긴다. 탭이 죽어도 이 점은 살아 있어야 한다(D11).
      void bufferPoints([
        { ...point, userId, sessionId, accuracy: point.accuracy ?? null },
      ])
        .then(() => scheduleFlush(0))
        .catch(() => setUploadStatus("offline"));
    },
    [
      enterGap,
      leaveGap,
      scheduleFlush,
      sessionId,
      startedAtMs,
      trackerGeneration,
      userId,
    ],
  );

  const handleError = useCallback(
    (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        stopWatch();
        gapPendingRef.current = true;
        clearWarningTimer();
        setGpsWarning(false);
        setStatus("permission-denied");
        return;
      }

      // POSITION_UNAVAILABLE · TIMEOUT — 관측 즉시 끊김이다(D10).
      enterGap("signal");
    },
    [clearWarningTimer, enterGap, stopWatch],
  );

  const startWatch = useCallback(() => {
    if (stoppedRef.current || watchIdRef.current !== null) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      handleFix,
      handleError,
      GEOLOCATION_OPTIONS,
    );
    // 첫 accept 가 올 때까지는 gap 표시를 유지한다.
    setStatus((current) => (current === "starting" ? "tracking" : current));
  }, [handleError, handleFix]);

  /** 화면이 켜져 있는 동안만 best-effort 로 요청한다. 실패해도 러닝을 실패시키지 않는다(D1). */
  const requestWakeLock = useCallback(async () => {
    try {
      wakeLockRef.current =
        (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      // 미지원 · 거부 · UA 해제. background GPS 보장 수단이 아니므로 그냥 넘어간다.
    }
  }, []);

  // ── 시작 ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    stoppedRef.current = false;

    void (async () => {
      /*
        **watch 를 시작하기 전에** 종료 의사를 본다. 이미 종료를 눌렀는데 다시 측정하면
        끝난 러닝에 점이 더 붙는다. 결과 복구 화면 자체는 #85 가 만든다.
      */
      const intent = await readFinishIntent({ userId, sessionId }).catch(
        () => null,
      );
      if (cancelled) return;
      if (intent) {
        setStatus("finish-pending");
        return;
      }

      const record = await readTrackerRecord(userId).catch(() => null);
      if (cancelled) return;
      if (
        !record ||
        record.sessionId !== sessionId ||
        record.trackerGeneration !== trackerGeneration
      ) {
        setStatus("read-only");
        return;
      }

      await requestPersistentStorage();

      const mine = serverPointsRef.current.filter(
        (point) => point.trackerGeneration === trackerGeneration,
      );
      const buffered = await readBufferedPoints({
        userId,
        sessionId,
        trackerGeneration,
      }).catch(() => []);
      const bufferMax = await maxBufferedRawSeq({
        userId,
        sessionId,
        trackerGeneration,
      }).catch(() => 0);
      if (cancelled) return;

      const serverMax = mine.reduce(
        (max, point) => Math.max(max, point.rawSeq),
        0,
      );

      /*
        이어 붙일 번호는 **`max(서버 max, 버퍼 max) + 1`** 이다(D11).
        `ackThroughRawSeq + 1` 로 하면 서버에 이미 있는 번호를 다른 좌표로 재사용해 충돌한다.
      */
      nextRawSeqRef.current = Math.max(serverMax, bufferMax) + 1;

      const restored = mergeByRawSeq(mine, buffered.map(toRawPoint));
      setPoints(restored);

      /*
        이 generation 에 이미 accept 가 있으면 **gap pending 으로 시작한다**(D10).
        다시 연 사이에 움직였을 수 있으므로 이전 점과 새 점을 한 선으로 이으면 안 된다.
      */
      const last = restored.at(-1);
      if (last) {
        lastAcceptedRef.current = {
          recordedAt: last.recordedAt,
          segment: last.segment,
        };
        gapPendingRef.current = true;
      }

      startWatch();
      void requestWakeLock();
      scheduleFlush(0);
    })();

    return () => {
      cancelled = true;
      stoppedRef.current = true;
      stopWatch();
      clearWarningTimer();
      if (flushTimerRef.current !== null) clearTimeout(flushTimerRef.current);
      void wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
    };
  }, [
    clearWarningTimer,
    requestWakeLock,
    scheduleFlush,
    sessionId,
    startWatch,
    stopWatch,
    trackerGeneration,
    userId,
  ]);

  // ── 화면이 숨고 다시 보일 때(D1) ──────────────────────────────────────────
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        stopWatch();
        enterGap("platform");
        return;
      }

      void (async () => {
        if (stoppedRef.current) return;

        /*
          숨어 있는 동안 사용자가 권한을 거둘 수 있다. 다시 물어본다 —
          Permissions API 가 없으면 watch 를 걸어 보고 오류로 알게 된다.
        */
        const state = await navigator.permissions
          ?.query({ name: "geolocation" })
          .then((result) => result.state)
          .catch(() => undefined);

        if (state === "denied") {
          setStatus("permission-denied");
          return;
        }

        // 다음 accept 는 새 segment 에서 시작한다 — 숨은 구간을 선으로 잇지 않는다.
        gapPendingRef.current = true;
        startWatch();
        void requestWakeLock();
        scheduleFlush(0);
      })();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [enterGap, requestWakeLock, scheduleFlush, startWatch, stopWatch]);

  // ── 연결이 돌아오면 바로 올린다 ──────────────────────────────────────────
  useEffect(() => {
    function onOnline() {
      attemptRef.current = 0;
      scheduleFlush(0);
    }

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [scheduleFlush]);

  // ── 현재 페이스만 1초마다 다시 본다 ──────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setPaceTick(Date.now()), PACE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  /*
    수치는 전부 #82 가 낸다. 점이 늘 때만 다시 계산한다.

    ponytail: 점이 늘 때마다 전체를 다시 계산한다(O(n)). 1시간 러닝이 3,600점이라 아직
    문제가 되지 않는다. 느려지면 마지막 구간만 더하는 증분 계산으로 바꾼다.
  */
  const result = useMemo(() => measure(points), [points]);
  const pace = useMemo(
    () =>
      currentPace(points, paceTick, { startedAt: startedAtMs }),
    [points, paceTick, startedAtMs],
  );

  const lastMeasured = result.routePoints.findLast(
    (point) => point.kind === "measured",
  );

  /*
    측정을 **먼저** 멈추고 IndexedDB 에 종료 intent 를 남긴다(#85 · D11) — 결과 화면으로
    옮기기 전에 이 기기가 더 이상 점을 만들지 않는다는 것을 durable 하게 확정해 둔다.

    tracker record 를 다시 읽는 이유 — token 은 `useState` 로 들고 있지 않고 IndexedDB 에만
    있다(D11, 인증 값과 같은 취급). record 가 없거나 이 세션 것이 아니면(read-only 기기가
    실수로 눌렀을 경우) 아무것도 남기지 않는다 — writer 가 아닌 기기의 종료 intent는 없다.
  */
  const finish = useCallback(
    async (clientFinishedAt: number) => {
      stoppedRef.current = true;
      stopWatch();
      clearWarningTimer();
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      const record = await readTrackerRecord(userId).catch(() => null);
      if (!record || record.sessionId !== sessionId) return;

      await writeFinishIntent({
        userId,
        sessionId,
        trackerToken: record.trackerToken,
        trackerGeneration: record.trackerGeneration,
        clientFinishedAt,
        lastRawSeq: finishLastRawSeq(
          nextRawSeqRef.current,
          droppedRawSeqsRef.current,
        ),
      });
    },
    [clearWarningTimer, sessionId, stopWatch, userId],
  );

  return {
    status,
    gpsWarning,
    uploadStatus,
    routePoints: result.routePoints,
    totalDistanceM: result.totalDistanceM,
    tancheonDistanceM: result.tancheonDistanceM,
    currentPaceSecPerKm: pace,
    inZone: lastMeasured?.inZone ?? false,
    marker: lastMeasured
      ? { lat: lastMeasured.lat, lng: lastMeasured.lng }
      : null,
    finish,
  };
}
