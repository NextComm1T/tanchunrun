"use server";

import { cookies } from "next/headers";

import { PRIVACY_CONSENT_VERSION } from "@/app/signup/consent/consentSections";
import { readAuthEnv, sessionCookieName } from "@/server/auth/config";
import { getViewer, sessionCookieAttributes } from "@/server/auth/session";

import { hasCurrentConsent, insertCurrentConsent } from "./consent";
import {
  saveInitialNickname,
  updateStoredNickname,
  type NicknameSaveError,
} from "./nickname";
import { deleteAccount, type WithdrawError } from "./withdraw";

/**
 * 계정 관련 server action — 가입 흐름(#80)과 회원 탈퇴(#88).
 *
 * 네 함수 모두 **userId 를 `getViewer()` 에서만 얻는다.** client 가 보낸 userId 를 받는
 * 인자가 아예 없어서, 남의 계정을 지목할 방법이 없다.
 *
 * 이 파일은 `"use server"` 라서 `import "server-only"` 를 붙이지 않는다 —
 * server action 파일은 Next 가 클라이언트 번들에서 빼낸다.
 */

/**
 * 개인정보 수집·이용 동의 저장(D5).
 *
 * client 가 버전을 보내지만 **그 값을 저장하지 않는다.** 서버가 아는 현재 버전과 같은지만
 * 보고, 실제로 저장하는 값은 서버 상수다. 오래된 탭이 옛 문구에 동의한 채로 버튼을 누르면
 * (stale accept) 거절된다 — 사용자가 읽은 문구와 저장되는 동의가 어긋나면 안 된다.
 *
 * 같은 사용자가 같은 현재 버전으로 다시 불러도 **성공**이다(idempotent). 기존 행과
 * `agreed_at` 을 갱신하지 않으므로 최초 동의 시각이 유지된다.
 */
export async function acceptConsent(
  version: string,
): Promise<{ ok: true } | { ok: false; error: "failed" }> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, error: "failed" };

    if (version !== PRIVACY_CONSENT_VERSION) {
      return { ok: false, error: "failed" };
    }

    await insertCurrentConsent(viewer.userId);

    return { ok: true };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/**
 * 최초 닉네임 저장 → 가입 완료.
 *
 * **동의가 있어야 진행된다.** 화면 순서상 동의를 먼저 받지만, 이 action 을 직접 호출해
 * 동의를 건너뛰는 길을 서버가 막는다(P11 — 가드는 서버에서 검사한다).
 */
export async function setInitialNickname(
  nickname: string,
): Promise<{ ok: true } | { ok: false; error: NicknameSaveError }> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, error: "failed" };
    if (viewer.accountState !== "signing_up") {
      return { ok: false, error: "failed" };
    }

    if (!(await hasCurrentConsent(viewer.userId))) {
      return { ok: false, error: "failed" };
    }

    return await saveInitialNickname(viewer.userId, nickname);
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** 닉네임 수정. 실패하면 기존 닉네임이 그대로 남는다(P10). */
export async function updateNickname(
  nickname: string,
): Promise<{ ok: true } | { ok: false; error: NicknameSaveError }> {
  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, error: "failed" };
    if (viewer.accountState !== "active") {
      return { ok: false, error: "failed" };
    }

    return await updateStoredNickname(
      viewer.userId,
      nickname,
      viewer.nickname,
    );
  } catch {
    return { ok: false, error: "failed" };
  }
}

/**
 * 회원 탈퇴(#88 · F13 · P12 · P13 · D11).
 *
 * 순서가 계약이다 — **삭제가 커밋된 뒤에만 쿠키를 지운다.** 반대로 하면 계정은 남아 있는데
 * 로그아웃만 된 상태가 되고, 화면은 탈퇴한 것처럼 보인다(가짜 성공).
 *
 * **재인증을 요구하지 않는다**(D11 CONFIRMED). OAuth 재수행 · 닉네임 재입력 같은 단계 대신
 * ① 유효 session ② active run 차단 ③ Server Action origin 검사(Next 가 모든 server action
 * 요청에서 수행한다 — 여기서 헤더를 직접 읽지 않는다) ④ 원자적 트랜잭션 ⑤ 커밋 확인 후
 * 쿠키 삭제로 보호한다. 화면의 2단계(안내 화면 + 확인 모달)는 그대로 둔다.
 *
 * **기기 IndexedDB 정리는 여기서 하지 않는다.** 서버는 브라우저 저장소에 닿을 수 없어서,
 * 성공을 받은 화면이 `deleteLocalDataForUser()` 로 이어서 한다(D11 permanent cleanup ④).
 */
export async function withdraw(): Promise<
  { ok: true } | { ok: false; error: WithdrawError }
> {
  let deleted = false;

  try {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, error: "failed" };

    const result = await deleteAccount(viewer.userId);
    if (!result.ok) return result;

    deleted = true;

    const { secureCookies } = readAuthEnv();
    const store = await cookies();
    store.set(sessionCookieName(secureCookies), "", {
      ...sessionCookieAttributes(secureCookies),
      maxAge: 0,
    });

    return { ok: true };
  } catch {
    /*
      삭제가 커밋된 뒤에 쿠키를 지우다 실패한 경우다. 결과는 여전히 「탈퇴됨」이라
      `failed` 를 돌려주면 이미 사라진 계정을 두고 다시 시도를 시키게 된다.
      남은 쿠키가 가리키는 `auth_sessions` 행도 함께 지워졌으므로 다음 요청은 로그아웃이다.
    */
    if (deleted) return { ok: true };

    return { ok: false, error: "failed" };
  }
}
