/**
 * 개인정보 수집·이용 동의의 고지 문구와 **버전**(#80 · D5).
 *
 * `detail/page.tsx` 안에 있던 상수를 여기로 옮겼다. 이유는 D5 가 정한 한 가지다 —
 * **버전 상수는 고지 문구 상수 옆에 있어야 한다.** 문구를 고치는 사람이 버전을 같이
 * 올리도록 두 값을 한 파일에 둔다. 같은 모양의 선례가 이미 있다(`../../privacy-policy/policySections.ts`).
 *
 * 문구 자체는 법적 고지라 디자인 원문(L149-162) 그대로 두고 임의로 다듬지 않는다.
 * 문서(05-policy.md:43 SP3)와 갈리는 지점은 `modify/2026-09-14-signup-consent-detail.md`.
 */

export type ConsentSection = {
  title: string;
  body: string;
};

/**
 * 동의 상세에 보여 주는 고지 4절(디자인 L149-162).
 *
 * **이 배열을 고치면 아래 `PRIVACY_CONSENT_VERSION` 을 함께 올린다.** 올리지 않으면
 * 이미 동의한 사용자가 바뀐 문구에 동의한 것으로 남는다.
 */
export const CONSENT_SECTIONS: readonly ConsentSection[] = [
  {
    title: "수집·이용 목적",
    body: "소셜 로그인 기반 회원 식별, 탄천 러닝 기록 저장 및 랭킹 제공",
  },
  {
    title: "수집·이용 항목",
    body: "소셜 계정 식별자, 닉네임, 러닝 기록(거리·시간·페이스), 러닝 중 위치정보",
  },
  {
    title: "보유 및 이용기간",
    body: "회원 탈퇴 시까지 보유하며, 탈퇴 후 지체 없이 삭제합니다.",
  },
  {
    title: "동의 거부 권리 및 제한",
    body: "동의를 거부할 수 있습니다. 다만 필수 항목에 동의하지 않으면 회원가입 및 러닝 기록·랭킹 서비스를 이용할 수 없습니다.",
  },
] as const;

/**
 * 저장되는 동의 종류. **D5 가 단일 required 타입 하나로 확정했다** —
 * optional 항목도, 그 밖의 `consent_type` 도 만들지 않는다(가입 화면 체크박스 1개 · 디자인 L107-135).
 *
 * 위치정보는 별도 row 가 없다. 위 「수집·이용 항목」 안에 포함되며,
 * `/settings/location` 은 체크박스 · CTA 없는 순수 고지 화면이라 저장 대상이 아니다.
 */
export const PRIVACY_CONSENT_TYPE = "privacy_collection_use";

/**
 * 동의 문구의 버전. **코드 상수이고 사람이 올린다**(D5) — 자동 생성하지 않는다.
 *
 * 서버는 이 값과 일치하는 동의만 저장하고, 가입 재개 판정도 이 버전의 행이 있는지로 한다.
 * 문구를 바꾸면서 이 값을 올리지 않으면 바뀐 고지에 동의한 것으로 기록이 남는다.
 */
export const PRIVACY_CONSENT_VERSION = "2026-09-14";
