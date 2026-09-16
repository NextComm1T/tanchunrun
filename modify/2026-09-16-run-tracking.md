# 2026-09-16 — 러닝 실측(`/running`, #83) · 구현 ↔ 기획 문서 차이

> 기획 문서(`docs/01~07`)는 고치지 않고 갈라지는 지점만 여기 쌓아 둔다. 규칙은
> [ARCHITECTURE.md](../docs/ARCHITECTURE.md) 「기획 문서와 다르게 구현했다면」.
>
> **이 파일은 기록일 뿐, 문서를 고치지 않았다.**

이번 작업: 이슈 #83(B4b). GPS 수집 · 업로드 · 오프라인 버퍼 · 실시간 표시 · running 지도 전환.
D1 background 측정 차이는 [2026-09-16-background-gps.md](./2026-09-16-background-gps.md) 에 따로 적었다.

---

## 1. `?state=` 로 화면 상태를 고르던 계약이 사라졌다

- **문서**: `docs/07-screens.md:12` 는 모든 화면이 불러오는 중 · 빈 상태 · 오류 · 정상을
  구분하라고 한다. #40 은 서버가 없던 시절 `?state=` 쿼리로 그 상태를 골랐다.
- **구현**: 이제 화면이 보여 주는 것은 **전부 실제 측정 결과**다. `src/app/running/mock.ts` 와
  `?state=` 를 지웠고, 도메인 상태(측정 중 · 끊김 · 권한 거부 · 종료 대기 · read-only)는
  `useRunTracker` 가 실제 관측에서 낸다.
- **고쳐야 할 곳**: 없음 — #40 이 남긴 임시 계약을 해소한 것이다. `modify/2026-09-15-running.md`
  1번의 「가짜 상태를 만들지 않는다」가 그대로 지켜졌다.

## 2. GPS 측정 지점에 `tracker_generation` 이 붙었다

- **문서**: `docs/06-data.md:34` 「GPS 측정 지점」은 세션과 지점만 말하고 generation 이 없다.
- **구현**: 키가 **`(session_id, tracker_generation, raw_seq, ordinal)`** 이다. D14 가 기기
  takeover 를 허용하면서 `raw_seq` 가 generation 마다 1 부터 다시 시작하게 됐고(D11), generation
  없이는 지점을 유일하게 가리킬 수 없다.
- **고쳐야 할 곳**: `docs/06-data.md:34` 의 「GPS 측정 지점」 키 설명에 generation 을 넣는다.

## 3. 컬럼 주석을 SQL `COMMENT` 로 달지 않았다

- **문서 · 이슈**: #83 본문은 `excluded_from_prev_reason` 컬럼에 「같은 generation · 같은 segment 의
  직전 measured 점 → 이 점 구간의 제외 사유」라는 **컬럼 주석**을 요구한다.
- **구현**: drizzle-kit 이 `COMMENT ON COLUMN` 을 생성하지 않고, **생성된 SQL 은 손으로 고치지
  않는다**(`docs/PROJECT_COMMANDS.md` migration 정책). 그래서 같은 문장을
  `src/server/db/schema.ts` 의 컬럼 JSDoc 으로 넣었다 — 개발자가 실제로 읽는 자리이고,
  SQL 주석과 달리 타입과 함께 따라다닌다.
- **고쳐야 할 곳**: DB 주석이 정말 필요하면 별도 migration 으로 `COMMENT ON` 을 추가하는 것을
  #89 에서 정한다. 지금은 blocker 가 아니다.

## 4. 「불러오는 중 · 오류」가 요청 단위가 아니라 **업로드 상태**로 나온다

- **문서**: `docs/07-screens.md:12` 의 네 상태.
- **구현**: 러닝 화면에는 사용자가 기다리는 요청이 없다 — 측정은 기기에서 계속되고 업로드는
  뒤에서 재시도한다. 그래서 오류를 화면 전체 상태로 두지 않고 **띠 안내**로만 보인다
  (오프라인 · 인증 만료 · rate limit). **어느 경우에도 측정을 멈추지 않는다**(P14 · D11).
  인증 만료는 「다시 로그인」, 권한 거부는 「위치정보 설정 보기」로 다음 행동을 함께 준다.
- **고쳐야 할 곳**: `docs/07-screens.md:12` 에 「배경 작업의 실패는 화면 상태가 아니라 안내로
  보인다」를 덧붙인다.

## 5. `route_points` 의 파생 필드는 비어 있다

- **문서**: `docs/06-data.md:34` 는 지점마다 「Ranking Zone 내부 여부」와 「거리 계산 제외 여부 ·
  사유」를 저장한다고 한다.
- **구현**: 컬럼은 만들었지만 **#83 은 채우지 않는다.** raw 측정점(`ordinal = 0`)은 저장 후
  불변이고, `in_zone` · `excluded_from_prev_reason` · 경계점(`ordinal ≥ 1`)은 종료 처리(#85)가
  확정한다. 러닝 중 화면이 보여 주는 값은 저장하지 않고 `measure()` 가 그때그때 낸다.
- **고쳐야 할 곳**: `docs/06-data.md:34` 에 「파생 필드는 종료 시 확정된다」를 적는다.

## 6. IndexedDB 는 데이터베이스 하나를 나눠 쓴다

- **문서**: 해당 항목 없음(저장 위치는 06 범위 밖이다).
- **구현**: `tancheonrun` v2 한 개에 store 세 개(`tracker` · `points` · `finishIntent`)다.
  DB 열기 · 버전 · store 이름을 `src/client/idb.ts` 한 곳으로 모았다 — #81 의 `tracker.ts` 가
  v1 로, #83 의 버퍼가 v2 로 각각 열면 `VersionError` 로 한쪽이 통째로 실패한다.
  `tracker.ts` 에서 옮긴 것은 그 저수준 코드뿐이고 동작은 그대로다.
- **고쳐야 할 곳**: 없음.

## 7. `npm test` 범위를 `src/**` 로 넓혔다

- **문서**: `docs/PROJECT_COMMANDS.md` 가 「`src/domain` 의 순수 함수만」이라고 적고 있었다(#82).
- **구현**: 업로드 ACK 규칙(연속 구간까지만 ACK · 같은 값이면 멱등)은 서버 계약이지만 계산
  자체는 순수하다. `src/server/runs/ack.ts` 로 떼어 내고 `vitest.config.mts` 의 `include` 를
  `src/**/*.test.ts` 로 넓혔다. **기준은 경로가 아니라 성격**이다 — DOM · DB · 네트워크가
  필요한 코드는 여전히 대상이 아니고, `import "server-only"` 가 붙은 모듈은 애초에 import 조차
  되지 않는다.
- **고쳐야 할 곳**: 없음 — `docs/PROJECT_COMMANDS.md` 를 이번 PR 에서 함께 고쳤다(#83 이 수정을
  허용받은 문서는 아니지만, `npm test` 설명이 이 변경으로 사실과 달라지기 때문이다. 리뷰에서
  덜어 내라고 하면 되돌린다).
