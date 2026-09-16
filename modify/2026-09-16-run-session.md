# 2026-09-16 — 러닝 세션 시작 · GPS 준비 · P12 로그아웃 차단 (#81)

> 구현 기준은 캡처된 디자인과 #78 ledger 의 확정 결정(D8 · D14)이다. 기획 문서(`docs/01~07`)는
> 고치지 않고 갈라지는 지점만 여기 쌓아 둔다. 규칙은
> [ARCHITECTURE.md](../docs/ARCHITECTURE.md) 「기획 문서와 다르게 구현했다면」.

---

## 1. running route 는 `/running` 고정이다 (D8)

- **문서**: `docs/07-screens.md:35-38` 의 첫 화면 분기는 「진행 중 세션 있음 → 러닝 진행 화면」
  까지만 말하고 URL 형태를 정하지 않는다.
- **디자인 · 구현**: D8 확정값대로 **`/running` 고정 경로 하나**다. `/running/[id]` 도 alias 도
  없다. 러닝 화면(server component)이 `getViewer()` 로 확인한 사용자의 `status = 'active'`
  세션을 **서버가 직접 조회**하고, client 가 sessionId 를 URL · 쿼리로 넘기지 않는다.
  진행 중인 러닝이 없으면 `/home` 으로 보낸다.
  - 이유: 계정당 active run 이 항상 1개라 id 가 필요 없고, `/running/[id]` 는 남의 세션 id 를
    URL 로 추측·전달할 표면을 만든다. 완료되어 불변인 자원만 id 를 갖는다
    (`/result/[sessionId]` · `/records/[sessionId]`).
- **고쳐야 할 곳**: `docs/07-screens.md:35-38` 에 러닝 진행 화면의 경로를 적을 때 이 형태를 쓴다.

## 2. GPS 비준비 상태가 1종에서 3종이 됐다

- **문서 · 디자인**: 디자인의 비준비 상태는 「GPS 확인 중」 하나뿐이다(L724-730).
  위치 권한 미허용 · GPS 미확보 안내가 정본에 없어 #42 는 만들지 않았다.
- **디자인 · 구현**: 실제 권한 · 측위가 붙으면서 **확인 중 · 권한 거부 · 신호 없음** 셋으로
  나눴다. #81 이 문구를 지정했다 — 거부는 「위치 권한을 허용해야 러닝을 시작할 수 있습니다」
  + 위치정보 화면(`/settings/location`)으로 가는 길, 미확보는 「GPS 신호를 확인할 수 없어
  러닝을 시작할 수 없습니다」.
  - 나눈 이유는 사용자가 할 일이 다르기 때문이다. 거부는 브라우저 설정을 고쳐야 풀리고,
    측위 실패는 자리를 옮겨 다시 시도하면 풀린다. 한 문구로 묶으면 둘 다 막막해진다.
  - **권한 허용만으로는 시작할 수 없다**(P1). 현재 위치를 한 번 이상 확보해야 한다 —
    실내에서는 권한이 있어도 좌표가 오지 않는데 그대로 시작하면 출발점 없는 러닝이 된다.
- **고쳐야 할 곳**: `docs/07-screens.md` 홈 달리기 탭의 상태 목록, `docs/05-policy.md` P1.

## 3. `?gps=` · `?session=` 쿼리 계약을 없앴다

- **문서 · 기존 구현**: 서버가 없던 동안 `/home?gps=ready` 와 `/settings?session=active` 로
  상태를 골라 보여 줬다(리뷰어가 코드를 고치지 않고 확인하는 방법).
- **디자인 · 구현**: 실제 측위와 실제 `run_sessions` 조회가 붙어서 두 쿼리를 제거했다.
  로그아웃 차단은 이제 `getViewer().hasActiveRun` 이 판단하고, **서버 `signOut()` 이 막는다.**
  - `/settings/withdraw?session=running` 은 **남겨 뒀다** — 탈퇴 화면은 #88 소유다.
    같은 뜻을 두 화면이 다른 리터럴(`active` vs `running`)로 쓰던 것도 #88 이 정리한다.
- **고쳐야 할 곳**: 없음(문서에 쿼리 계약이 없다).

## 4. tracker 는 single writer + 사용자 명시적 인수다 (D14)

- **문서**: 문서에 다기기 측정 정책이 없다.
- **디자인 · 구현**: D14 확정값대로 `tracker_generation`(시작 1) + `tracker_token_hash` 로
  「지금 쓸 수 있는 writer」를 표현한다. tracker 가 아닌 기기의 `/running` 은 **read-only** 로
  덮이고, **자동 인수는 없다** — reload · 재로그인이 generation 을 바꾸지 않는다.
  사용자가 「이 기기에서 이어서 측정」을 고르면 `takeoverRun` 이 한 UPDATE 로 generation 을
  올리고 token 을 바꿔 이전 generation 을 봉인한다.
  - 인수 확인 UI 에 **구 기기의 미전송 기록이 유실될 수 있다**는 사실을 적었다(D14 잔여 위험).
  - D14 가 함께 정한 **「여기서 종료」는 이 PR 에 없다** — 종료 처리(#85)가 있어야 한다.
    그래서 stuck active 의 해소 경로도 아직 열리지 않았다.
- **고쳐야 할 곳**: `docs/05-policy.md` 에 다기기 측정 정책을 추가한다.

## 5. 브라우저 전용 durable 저장을 `src/client/` 에 뒀다

- **문서**: `docs/ARCHITECTURE.md` 의 D12 경계는 `src/domain`(순수 TS)과 `src/server`
  (서버 전용) 둘만 정한다. **브라우저 전용 모듈의 자리가 없다.**
- **디자인 · 구현**: tracker record 의 IndexedDB 저장을 `src/client/tracker.ts` 에 뒀다.
  홈(저장)과 러닝(복원·인수) 두 화면이 쓰고 #83(점 버퍼) · #85(finish intent)도 같은 저장소를
  쓸 예정이라 어느 한 화면 폴더에 넣을 수 없었다. `src/server` 의 대칭으로 읽힌다.
  - `src/components/shared/` 는 React 컴포넌트 자리라 맞지 않는다.
- **고쳐야 할 곳**: **담당자 확인이 필요하다.** 유지하기로 하면 `docs/ARCHITECTURE.md` 의
  「`src/server` · `src/domain` 경계」 표에 `src/client` 를 한 줄 추가한다.

## 6. 경과 시간은 서버 `started_at` 에서 센다

- **문서**: `docs/06-data.md` 는 세션의 시작 시각을 갖는다고만 한다.
- **디자인 · 구현**: 화면이 자체 타이머로 세지 않고 **서버 `started_at` 과 현재 시각의 차이**로
  계산한다. client 가 따로 세면 reload · 재진입마다 0 부터 다시 시작하고 탭이 백그라운드로
  내려간 동안 멈춘다. 서버 시각을 기준으로 두면 어느 기기로 언제 들어와도 같은 값이 나온다.
  기기 시계가 뒤처져 음수가 나오면 0 으로 막는다.
- **고쳐야 할 곳**: 없음.
