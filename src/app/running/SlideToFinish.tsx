"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "밀어서 러닝 종료" 슬라이드 컨트롤(디자인 L288-295 · 핸들러 L1028-1046 · #85).
 *
 * 이 화면에서 나가는 유일한 길이다 — 하단 탭바가 없다(`docs/07-screens.md:56`).
 * 그래서 포인터로만 움직이면 키보드 · 스위치 사용자는 러닝을 끝낼 수 없다. 노브를
 * `role="slider"` 로 두고 방향키 · End · Enter · Space 에도 같은 "끝까지 민다"를 준다(#120).
 *
 * 끝까지 밀면 **먼저** `onFinish` 로 측정을 멈추고 IndexedDB 에 종료 intent 를 남긴 뒤,
 * **곧바로** 같은 `sessionId` 의 결과 화면으로 `replace` 한다(D11 — 서버 전달 · finish 호출
 * 결과를 기다리지 않는다. 그건 결과 화면의 recovery gate 몫이다). 완료된 러닝 화면으로
 * 뒤로 가기가 돌아가지 않게 하는 정상 흐름 통합 정책이다(이슈 #40 · #41 결정 이력).
 */

type SlideToFinishProps = {
  sessionId: string;
  onFinish: (clientFinishedAt: number) => Promise<void>;
};

/** 트랙 안에서 핸들이 갖는 여백과 크기(디자인 L291-292). */
const KNOB_INSET = 6;
const KNOB_SIZE = 63;
/** 이만큼 밀면 끝까지 민 것으로 본다(원본 L1041). */
const FINISH_RATIO = 0.82;
/** 라벨이 완전히 사라지는 거리(원본 L1338). */
const LABEL_FADE_DISTANCE = 140;
/** 방향키 한 번이 움직이는 거리. 열 번을 눌러야 끝에 닿는다 — 한 번으로는 끝나지 않는다. */
const KEY_STEP_RATIO = 0.1;

export function SlideToFinish({ sessionId, onFinish }: SlideToFinishProps) {
  const router = useRouter();
  const hintId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [failed, setFailed] = useState(false);
  /*
    끝까지 밀었지만 아직 종료하지 않은 상태. 포인터는 82% 까지 끌어야 끝나는데 키보드만
    키 하나로 끝나면 오조작 방어가 키보드에서만 사라진다 — 포커스한 채 무심코 누른 Space
    한 번에 러닝이 끝난다. "끝까지 민다"와 "종료한다"를 두 입력으로 나눠, 확정 키 하나만
    쓸 수 있는 스위치 기기도 두 번 눌러 끝낼 수 있게 둔다.
  */
  const [armed, setArmed] = useState(false);

  // 포인터 이동 중에는 최신 값을 즉시 읽어야 해서 state 와 함께 ref 로도 들고 있는다.
  const offsetRef = useRef(0);
  const detachRef = useRef<(() => void) | null>(null);
  // 종료는 한 번뿐이다 — 성공 뒤 재탭 · 연타 · 키 반복이 `onFinish` 를 또 부르지 않게 막는다.
  const finishedRef = useRef(false);

  // 미는 도중에 화면이 바뀌어도 window 리스너가 남지 않게 한다.
  useEffect(() => () => detachRef.current?.(), []);

  /** 노브가 갈 수 있는 최대 거리. 트랙 폭이 화면마다 달라 그때그때 잰다. */
  function trackMax() {
    const track = trackRef.current;
    if (!track) return 0;
    return Math.max(0, track.clientWidth - KNOB_INSET * 2 - KNOB_SIZE);
  }

  function moveKnob(next: number, max: number) {
    offsetRef.current = next;
    setOffset(next);
    // 보조기기는 픽셀이 아니라 이 비율로 진행도를 읽는다.
    setProgress(max > 0 ? Math.round((next / max) * 100) : 0);
    // 끝에서 물러나면 확정 대기도 함께 풀린다.
    if (next < max) setArmed(false);
  }

  function finish(max: number) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinishing(true);
    setFailed(false);
    moveKnob(max, max);

    // 측정을 멈추고 종료 intent 를 남긴 뒤에만 이동한다 — 순서가 바뀌면 이동 중에
    // 탭이 죽었을 때 durable 기록 없이 화면만 바뀐 상태가 될 수 있다.
    void onFinish(Date.now())
      .then(() => router.replace(`/result/${sessionId}`))
      .catch(() => {
        /*
          종료 intent 를 남기지 못했다. 조용히 두면 이 화면에서 나갈 길이 없어 사용자가
          멈춘 화면에 갇힌다. 실패를 드러내고 노브를 원위치시켜 다시 시도할 수 있게 연다.
        */
        finishedRef.current = false;
        setFinishing(false);
        setFailed(true);
        moveKnob(0, trackMax());
      });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (finishedRef.current) return;

    const max = trackMax();
    const startX = event.clientX;
    const startOffset = offsetRef.current;

    function detach() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      detachRef.current = null;
    }

    function handleMove(moveEvent: PointerEvent) {
      setDragging(true);
      moveKnob(
        Math.max(0, Math.min(max, startOffset + moveEvent.clientX - startX)),
        max,
      );
    }

    function handleUp() {
      detach();
      setDragging(false);

      // 트랙을 재지 못했으면(max = 0) 민 것이 아니다 — 탭만으로 끝나지 않게 막는다.
      if (max > 0 && offsetRef.current >= max * FINISH_RATIO) {
        finish(max);
        return;
      }

      // 덜 밀었으면 제자리로 돌아간다.
      moveKnob(0, max);
    }

    /*
      제스처가 취소되면 `pointerup` 이 오지 않는다. 끝까지 밀었다는 근거가 없으니 종료로
      보지 않고, 리스너를 정리한 뒤 노브를 원위치시킨다 — 안 그러면 리스너가 남고
      `dragging` 이 true 로 고착된다.
    */
    function handleCancel() {
      detach();
      setDragging(false);
      moveKnob(0, max);
    }

    detachRef.current = detach;
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
  }

  /*
    키보드 · 스위치 입력에서도 **끝까지 가야** 끝난다. 방향키 한 번으로는 끝나지 않고,
    포커스만으로는 아무 일도 일어나지 않는다. End · Enter · Space 가 끝까지 미는 확정 조작이다.
  */
  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (finishedRef.current) return;

    const max = trackMax();
    if (max <= 0) return;

    const step = Math.max(1, max * KEY_STEP_RATIO);
    let next: number;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = Math.min(max, offsetRef.current + step);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = Math.max(0, offsetRef.current - step);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
      case "Enter":
      case " ":
        next = max;
        break;
      default:
        return;
    }

    // 우리가 처리한 키만 막는다 — 스크롤 · 기본 click 으로 새지 않게.
    event.preventDefault();

    /*
      끝에 닿는 것만으로는 끝나지 않는다. 닿으면 "확정 대기"가 되고 확정 키(Enter · Space ·
      End)를 **한 번 더** 눌러야 종료다. 방향키를 계속 눌러 끝에 닿아도 마찬가지다.
      `event.repeat` 를 빼는 이유 — 키를 누르고 있는 동안의 자동 반복은 두 번째 "누름"이
      아니다. 눌렀다 떼고 다시 눌러야 종료된다.
    */
    const isConfirmKey =
      event.key === "Enter" || event.key === " " || event.key === "End";

    if (next >= max) {
      if (armed && isConfirmKey && !event.repeat) {
        finish(max);
        return;
      }
      moveKnob(max, max);
      setArmed(true);
      return;
    }

    moveKnob(next, max);
  }

  return (
    <div className="shrink-0 px-4 pt-2 pb-[22px]">
      {/*
        종료 실패 안내. 디자인에 없는 요소지만 이 화면에서 나가는 길이 이 슬라이드뿐이라
        실패를 숨기면 사용자가 멈춘 화면에 갇힌다(#120). 로그아웃 · 탈퇴 실패 안내
        (`../settings/LogoutRow`)와 같은 토큰을 쓴다.
      */}
      {failed ? (
        <p
          role="alert"
          className="mb-2 rounded-md border-[1.5px] border-error-border bg-error-soft px-4 py-3 text-sm font-bold text-error"
        >
          러닝을 끝내지 못했어요. 측정은 이미 멈췄으니 다시 밀어서 종료해 주세요.
        </p>
      ) : null}

      <div
        ref={trackRef}
        className="relative h-[75px] touch-none overflow-hidden rounded-full bg-danger shadow-danger select-none"
      >
        {/* 노브가 같은 이름을 이미 갖고 있어 보조기기에는 중복이다 — 시각 전용으로 둔다. */}
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center pl-10 text-metric font-extrabold tracking-[-0.6px] text-on-primary"
          style={{ opacity: Math.max(0, 1 - offset / LABEL_FADE_DISTANCE) }}
        >
          밀어서 러닝 종료
        </span>

        <button
          type="button"
          role="slider"
          aria-label="밀어서 러닝 종료"
          aria-describedby={hintId}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={
            armed
              ? "끝까지 밀었습니다. 한 번 더 누르면 러닝이 종료됩니다."
              : `${progress}%`
          }
          aria-disabled={finishing || undefined}
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
          className="absolute top-1.5 left-1.5 flex size-[63px] cursor-grab items-center justify-center rounded-full bg-surface text-danger shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          style={{
            transform: `translateX(${offset}px)`,
            transition: dragging ? "none" : "transform .22s ease",
          }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h13M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/*
        확정 대기 안내. 화면을 보는 키보드 사용자에게도 "한 번 더"가 필요하다는 것이 보여야
        한다 — 보조기기는 같은 것을 노브의 `aria-valuetext` 로 읽는다.
      */}
      {armed && !finishing ? (
        <p
          role="status"
          className="mt-2 text-center text-note font-bold text-subtle"
        >
          한 번 더 누르면 러닝이 종료됩니다.
        </p>
      ) : null}

      {/* 노브만 만져서는 조작 방법을 알 수 없다 — 보조기기에만 읽히는 안내를 붙인다. */}
      <span id={hintId} className="sr-only">
        오른쪽 방향키 또는 End 키로 끝까지 민 뒤, Enter · Space 를 한 번 더 누르면 러닝이
        종료됩니다.
      </span>
    </div>
  );
}
