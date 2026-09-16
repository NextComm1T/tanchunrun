/**
 * 홈 달리기 탭이 보여 주는 값들.
 *
 * 서버가 아직 없어서(`docs/ARCHITECTURE.md:171`) 닉네임 · 순위 · 누적 거리는 mock 이다.
 * 인증과 랭킹 조회가 붙으면 이 상수 자리가 그대로 서버 조회 자리가 된다.
 * 가짜 성공이나 가짜 실패로 흉내내지 않는다 — 값만 둔다.
 */

/*
  GPS 상태 · 문구는 여기 없다. 실제 권한 · 측위가 붙어서 mock 이 아니게 됐고,
  `./gps.ts`(문구)와 `./useGeolocationReady.ts`(상태)로 옮겼다(#81).
*/

/**
 * 인사말(디자인 L705).
 *
 * 세션에 실제 닉네임이 있지만(#80) **아직 mock 으로 둔다** — 홈 요약의 실데이터 전환은
 * #87 · #88 의 몫이고, #81 은 `home/mock.ts` 의 GPS · route 부분만 건드린다.
 */
export const MOCK_NICKNAME = "뚝심주자";

/** 내 탄천 순위 카드의 값(디자인 L760-768). */
export const MOCK_RANK = {
  position: 5,
  total: 14,
  /** 탄천 Ranking Zone 안에서 달린 누적 거리(km). 소수 첫째 자리까지 보여 준다. */
  tancheonDistanceKm: 61.0,
} as const;

/** 카운트다운이 끝나면 가는 곳(#40). 아직 없으면 404 가 정상이다. */
export const RUNNING_ROUTE = "/running";
