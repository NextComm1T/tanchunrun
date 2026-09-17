"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";

import { acceptConsent } from "@/server/account/actions";

import { PRIVACY_CONSENT_VERSION } from "./consentSections";

type ConsentFormProps = {
  /** 동의 카드와 계속하기 버튼 사이에 들어가는 정적 블록(개인정보처리방침 카드). */
  children?: ReactNode;
};

/**
 * 동의 상태를 담아 두는 자리(#38 인수 조건).
 *
 * 이 화면을 떠났다 돌아오는 경로가 셋인데 **두 개가 이 폴더 밖이다** —
 * 상세(`/signup/consent/detail`)는 같은 segment 안이지만, 개인정보처리방침
 * (`/privacy-policy`)과 닉네임 설정(`/signup/nickname`)은 아니다. 그래서
 * `signup/consent/layout.tsx` 에 Context 를 두는 방법으로는 세 경로를 다 덮지
 * 못한다(그 layout 이 언마운트된다). sessionStorage 는 셋 다 덮고 탭을 닫으면
 * 사라진다 — 근거는 modify/2026-09-14-signup-consent.md 6번.
 *
 * 저장하는 값은 **체크박스 UI 상태뿐**이라 개인정보가 아니고 SP3 수집 범위와
 * 무관하다. 서버가 붙으면 동의 여부·일시는 그때 서버에 저장한다(같은 문서 4번).
 */
const STORAGE_KEY = "signup-consent-agreed";

/** 값이 바뀌었을 때 다시 그려야 할 구독자들. 같은 탭 안에서만 쓴다. */
const listeners = new Set<() => void>();

/**
 * 저장된 동의 상태를 읽는다.
 *
 * `sessionStorage` 는 **문자열 저장소**라서 해제 상태는 `"false"` 로 들어간다.
 * `"false"` 도 truthy 이므로 `Boolean(getItem(...))` 로 읽으면 해제가 체크로
 * 되살아난다 — `"true"` 와 정확히 비교한다. 그 밖의 값·`null`·접근 실패는 전부
 * 미동의로 본다.
 */
function readAgreed() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // 프라이빗 모드·차단 등으로 읽을 수 없으면 미동의로 시작한다.
    return false;
  }
}

/** 해제(`false`)도 반드시 기록한다 — 그래야 돌아왔을 때 해제 상태로 복원된다. */
function writeAgreed(next: boolean) {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // 저장만 포기하고 화면 조작은 막지 않는다.
  }

  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/**
 * 필수 동의 항목과 계속하기 버튼 — 디자인 L107-132.
 */
export function ConsentForm({ children }: ConsentFormProps) {
  const router = useRouter();

  /*
    sessionStorage 는 React 밖의 저장소라 useSyncExternalStore 로 읽는다.
    세 번째 인자(서버 스냅샷)가 항상 false 라서 서버 HTML 과 hydration 이
    미동의 상태로 일치하고, 붙은 뒤에 저장된 값으로 다시 그려진다.
    effect 에서 setState 하는 방식(react-hooks/set-state-in-effect)을 피하는
    자리이기도 하다.
  */
  const agreed = useSyncExternalStore(subscribe, readAgreed, () => false);

  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    writeAgreed(!agreed);
  }

  /**
   * 동의를 **서버에 저장한 뒤에만** 닉네임 설정으로 넘어간다(#80).
   *
   * 저장에 실패했는데 다음 단계로 보내면 동의 없이 가입이 끝난다 — 가짜 성공이다.
   * 그래서 `ok` 일 때만 이동하고, 실패하면 이 화면에 머무르며 오류를 보인다.
   *
   * 버전을 함께 보내지만 서버는 그 값을 저장하지 않고 **자기가 아는 현재 버전과 같은지만**
   * 본다. 오래 열어 둔 탭이 옛 문구에 동의하는 것을 막는다.
   *
   * 재호출은 서버가 idempotent 하게 처리하므로(같은 버전이면 기존 행 유지) 두 번 눌러도
   * 동의 시각이 밀리지 않는다.
   */
  function handleContinue() {
    setFailed(false);

    startTransition(async () => {
      const result = await acceptConsent(PRIVACY_CONSENT_VERSION);

      if (!result.ok) {
        setFailed(true);
        return;
      }

      router.push("/signup/nickname");
    });
  }

  return (
    <div className="flex flex-1 flex-col pb-[22px]">
      <div className="rounded-2xl border-[1.5px] border-border bg-surface shadow-card">
        {/*
          토글과 상세 이동은 서로 다른 동작이다. 두 영역이 겹치지 않게 형제로
          두고, 버튼 안에 버튼을 넣지 않는다. 체크 네모는 <span> 이고 클릭은
          바깥 토글 버튼이 받는다.
        */}
        <div className="flex items-center py-[17px] pr-5">
          <button
            type="button"
            role="checkbox"
            aria-checked={agreed}
            onClick={handleToggle}
            /*
              세로 여백 11px 로 hit area 를 48px 로 만들고, 음수 margin 으로
              레이아웃 높이는 체크 네모 26px 그대로 둔다 — 카드 높이를
              디자인(L107 행 = 화살표 32px 기준)과 맞추기 위해서다.
            */
            className="-my-[11px] flex min-w-0 flex-1 cursor-pointer items-center gap-[14px] py-[11px] pl-5 text-left"
          >
            <span
              className={`flex size-[26px] shrink-0 items-center justify-center rounded-[9px] border-[1.5px] ${
                agreed
                  ? "border-primary bg-primary"
                  : "border-border-strong bg-surface"
              }`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={`text-on-primary ${agreed ? "opacity-100" : "opacity-0"}`}
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </span>

            <span className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-sm font-extrabold text-primary">
                [필수]
              </span>
              <span className="truncate text-base font-bold">
                개인정보 수집·이용 동의
              </span>
            </span>
          </button>

          {/*
            디자인의 화살표 버튼은 배경이 없어(L115) 보이는 것은 아이콘뿐이다.
            클릭 상자만 48×48 로 키우고 음수 margin 으로 되돌리면 아이콘 위치는
            디자인 그대로(오른쪽에서 36px)이면서 터치 영역만 넓어진다.
          */}
          <Link
            href="/signup/consent/detail"
            aria-label="개인정보 수집·이용 동의 내용 보기"
            className="-my-2 -mr-2 flex size-12 shrink-0 items-center justify-center text-muted"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        </div>
      </div>

      {children}

      <div className="mt-auto pt-6 pb-2.5">
        {/*
          저장 실패 안내. 디자인에 없는 요소지만 #80 이 「동의 저장 실패 → 진행하지 않고
          오류 안내」를 요구한다. 로그인 · 로그아웃 실패 안내와 같은 토큰을 쓴다.
        */}
        {failed ? (
          <p
            role="alert"
            className="mb-3 rounded-md border-[1.5px] border-error-border bg-error-soft px-4 py-3 text-sm font-bold text-error"
          >
            동의를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.
          </p>
        ) : null}

        <button
          type="button"
          disabled={!agreed || pending}
          onClick={handleContinue}
          className={`h-[60px] w-full cursor-pointer rounded-xl text-[19px] font-extrabold disabled:cursor-not-allowed ${
            agreed
              ? "bg-primary text-on-primary disabled:opacity-60"
              : "bg-disabled-surface text-disabled"
          }`}
        >
          동의하고 계속하기
        </button>
      </div>
    </div>
  );
}
