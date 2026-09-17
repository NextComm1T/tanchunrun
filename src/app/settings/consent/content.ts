/**
 * 개인정보 수집·이용 동의(보기) 화면의 값들.
 *
 * 고지 문구는 전부 디자인 `탄천런.dc.html` L544-561 의 것을 그대로 옮겼다.
 * 이 화면은 **읽기 전용**이라 여기서 동의를 철회하거나 바꿀 수 없다(#88 제외 범위) —
 * 철회에 해당하는 행동은 회원탈퇴(`/settings/withdraw`)다.
 */

/**
 * 동의 기록 조회 결과(#88).
 *
 * 디자인에는 「동의 완료」 하나뿐이다(L545) — 가입 단계에서 필수 동의를 받아야 서비스에
 * 들어올 수 있으므로(`docs/04-features.md:23` F8 흐름) 정상 상태는 이 하나다.
 * `unknown` 은 **현재 버전 동의 행이 없는** 경우다(D5 — 버전까지 같아야 동의로 본다).
 */
export type ConsentStatus = "agreed" | "unknown";

/** 동의 항목 이름 — 디자인 L544. */
export const CONSENT_ITEM_LABEL = "[필수] 개인정보 수집·이용 동의";

/** 동의 상태 문구 — 「동의 완료」는 디자인 L545 그대로다. */
export const CONSENT_STATUS_LABEL: Record<ConsentStatus, string> = {
  agreed: "동의 완료",
  unknown: "확인 불가",
};

/** 동의 상태 색 — 디자인 L545 는 `#2F6FE8`(primary). 값이 없다는 뜻인 쪽은 muted. */
export const CONSENT_STATUS_TONE: Record<ConsentStatus, string> = {
  agreed: "text-primary",
  unknown: "text-muted",
};

/** 수집·이용 목적(디자인 L549). */
export const COLLECTION_PURPOSES = [
  "회원 식별",
  "회원가입 및 로그인",
  "사용자 관리",
  "닉네임 기반 서비스 제공",
  "러닝 기록 저장 및 조회",
  "탄천 인정 거리 및 누적 기록 관리",
  "랭킹 서비스 제공",
  "기록 상세 화면의 러닝 경로 제공",
] as const;

/** 수집·이용 항목(디자인 L553). */
export const COLLECTED_ITEMS = [
  "서비스 사용자 식별정보",
  "소셜 로그인 제공자",
  "소셜 제공자의 사용자 고유 식별값",
  "닉네임",
  "러닝 기록",
  "GPS 위치정보 및 이동 경로",
  "러닝 거리, 러닝 시간, 페이스",
  "탄천 인정 거리, 누적 거리",
  "랭킹 정보",
] as const;

/** 보유 및 이용기간(디자인 L557). */
export const RETENTION_PERIOD =
  "회원 탈퇴 시까지 보유하며, 탈퇴 시 계정에 연결된 데이터를 삭제합니다. 항목별 구체적 보유기간은 정책 확정 후 반영 예정입니다.";

/** 동의 거부 권리 및 제한(디자인 L561). */
export const REFUSAL_RIGHT =
  "동의를 거부할 수 있습니다. 다만 필수 항목 처리가 불가능하면 회원가입과 러닝 기록·랭킹 등 핵심 서비스를 이용할 수 없습니다.";
