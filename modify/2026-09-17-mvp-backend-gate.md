# 2026-09-17 — MVP Backend Completion Gate 판정 기록 (#89)

> 기준: `origin/develop` = `4494f52`(#139 · #140 · #141 · #142 반영) · integration 배포
> `https://tanchunrun-git-develop-wol20670s-projects.vercel.app` · Neon integration `summer-bonus-83521166`.
> 이 파일은 **판정 기록**이다. 기획 문서(`docs/01~07`)는 고치지 않았다.

## 0. 판정 요약 — 2차 (로컬 실측 후 · 2026-09-17)

| 구분 | 수 |
| --- | --- |
| 통과 | **10** — Root · Start · P8 · Result · Records · PB · Settings · Withdrawal · Mock · E2E |
| 미통과 | **6** — Signup · Measurement · Finish · Ranking · Home · Failure |
| 미검증(사유) | **3** — Auth(실제 provider 창에서 취소) · Location/GPS(화면 꺼짐 구간 · 실기기) · Map(NAVER 실제 load · load 실패) |

**Phase 1 시작 조건 문장의 판정: 거짓.** 미통과 6항목의 원인은 **결함 5건(6절 F1~F5)** 이다. **F1 · F2 는 2026-09-18 에 고쳐 merge 했다(7절) — 재판정은 F3 · F4 뒤 3차에서 한다.** 특히 F1(랭킹 동점 시
랭킹 · 홈 전체 오류 + 그 러닝의 저장 실패)과 F2(점 하나가 거절되면 그 러닝의 업로드 · 종료가 영구히 막힘)는
「주요 flow 가 실제 데이터로 end-to-end 동작한다」를 조건부로만 참으로 만든다.

2차 실측은 **로컬**(develop `4494f52` 빌드 + PostgreSQL 17)에서 했다. 방법 · 우회 · 한계는 6-1.
1차 요약은 아래에 그대로 둔다.

### 1차 요약 (실측 전)

| 구분 | 수 |
| --- | --- |
| 통과 | **1** — Mock |
| 미통과 | **0** |
| 미검증(사유) | **18** — 실측(실제 OAuth · 실제 GPS · 두 계정 · 두 기기 · 실패 주입) 전 |

**Phase 1 시작 조건 문장의 판정(1차): 거짓.**

> "현재 MVP 범위의 backend/auth/data/persistence 기능이 모두 실제 구현되어 있으며, frontend mock happy path 에
> 의존하지 않고, MVP 의 주요 사용자 flow 가 실제 데이터로 end-to-end 동작하고, 남은 미검증 항목과 플랫폼 제약이
> 명확히 기록되어 있다."

- 「실제 구현」 — **코드상 참으로 보인다.** 모든 화면의 데이터 출처가 `src/server/**` 조회이고 mock 이 없다(1-1)
- 「mock happy path 에 의존하지 않는다」 — **참.** 빌드 산출물로 확인했다(1-1)
- 「주요 flow 가 실제 데이터로 end-to-end 동작한다」 — **확인하지 못했다.** 연속 시나리오를 실제로 돌리지 않았다
- 「미검증 항목과 플랫폼 제약이 기록돼 있다」 — **이 파일과 `docs/ARCHITECTURE.md` 로 참이 된다**

세 번째 조건을 확인하지 못했으므로 문장 전체를 참이라 할 수 없다. **3절 실측 절차를 마친 뒤 이 판정을 다시 한다.**

### 판정 규칙

- **통과** — 항목의 하위 요구를 **모두** 실측했다. Mock 처럼 산출물 분석 자체가 검증인 항목은 그 분석을 실측으로 본다
- **미검증(사유)** — 하나라도 실측하지 못했다. 코드 근거는 함께 적지만 **코드 확인을 통과로 치지 않는다**
- **미통과** — 실측이 요구와 다르다. 이 PR 에서 고치지 않고 **별도 fix Issue** 로 올린다(#89 제외 범위)

---

## 1. 지금까지 실제로 확인한 것

### 1-1. Mock Gate 5항목 — 통과

| # | 요구 | 결과 | 근거 |
| --- | --- | --- | --- |
| 1 | production build 산출물에 mock 모듈 import 없음 | ✅ | `develop` `4494f52` 에서 `npm run build` 후 `.next/server` · `.next/static` 에서 `MOCK_[A-Z]` · `/mock.(ts\|js)` · `mockData` · `MOCK_RESULTS` **0 파일**. `.next/BUILD_ID` 가 HEAD 커밋보다 뒤에 만들어진 것을 확인 |
| 2 | production route 의 데이터 source 에 mock 없음 | ✅ | 화면 10개의 데이터 import 가 전부 `@/server/**` — home · ranking ← `rankingView` / records · 상세 ← `records` / result ← `runs/finish` / running ← `runs/actions` / settings · consent · withdraw · `/` ← `auth/session` · `account/consent` |
| 3 | dev-only fixture · preview query 가 production 에서 실행 불가 | ✅ | `src` 의 `searchParams` 사용은 2곳뿐 — `/login?error`(OAuth 실패 문구를 allowlist 에서 고름 · 서버 `auth/config.ts:181` 이 붙임) · `/signup/consent?provider`(「○○ 계정으로 가입」 문구만). **둘 다 데이터 출처가 아니다.** `?state=` · `?gps=` · `?session=` · `?location=` 계약은 코드에 없고 제거 기록 주석만 남아 있다. `NODE_ENV` 분기 없음 |
| 4 | DB seed 스크립트가 production bundle · runtime 과 분리 | ✅ | seed 스크립트 **자체가 없다** — 저장소 전체 `*seed*` 파일 0 · `package.json` scripts 에 seed 없음 |
| 5 | `MOCK_` · `mock.ts` grep 잔여의 dev-only 확인 | ✅ | `src` 에 mock · fixture · seed **파일 0.** 문자열은 주석 4곳뿐 — `result/[sessionId]/format.ts:5` · `settings/profile.ts:6`(「mock 이 아니다」) · `components/shared/NaverTancheonMap.tsx:168` · `proxy.ts:21`. 실행 코드 없음 |

**곁가지 — 낡은 주석 2곳**(실행에 영향 없음 · 별도 Issue 후보)

- `src/proxy.ts:21` — 「로그인 없이 볼 수 있는 화면들은 아직 전부 mock 이라 새는 데이터가 없다」 → 사실과 다르다
- `src/components/shared/NaverTancheonMap.tsx:27` — 「legacy `TancheonMap` 과 나란히 존재한다」 → legacy 는 #86 에서 삭제됐다

### 1-2. 미인증 접근 — integration 실측

cookie 없이 요청했다. `getViewer()` 는 cookie 가 없으면 DB 를 보지 않으므로 **DB 를 건드리지 않았다.**

| 요청 | 결과 |
| --- | --- |
| `GET` `/` · `/home` · `/running` · `/ranking` · `/records` · `/records/{id}` · `/result/{id}` · `/settings` · `/settings/withdraw` | **9개 모두 `307 → /login`** |
| `POST /api/runs/{id}/points` · `/finish` · `/retry` | **모두 `401 unauthenticated`** |
| `POST /api/runs/{id}/points` · 다른 `Origin` | `403 forbidden_origin` |

### 1-3. 요청 크기 · 처리 순서 — Vercel 실측 (#115 · PR #141)

기존 코드(develop 배포)와 새 코드(preview 배포)에 같은 미인증 요청을 보냈다. 상세는 #115 코멘트.

- chunked 300KB points: 기존 **다 읽고 413** → 새 코드 **읽지 않고 401**
- **Vercel 은 chunked 요청에 `Content-Length` 를 붙이지 않는다** — 헤더만 믿는 방어는 뚫린다
- finish 8KB: 기존 400(상한 없음) → 413

### 1-4. 정적 검증

- `npm run lint` — 통과 · `npm run build` — 통과(타입 검사 포함)
- `npm test` — **74 passed**. 순수 함수만이다(D12 2차):
  `src/domain/measure/measure.test.ts` 27 · `fix.test.ts` 12 · `src/server/runs/ack.test.ts` 23 · `bodyLimit.test.ts` 12
- **화면 · DB · 네트워크를 거치는 테스트는 없다.** 이 파일의 「통과」에 `npm test` 를 근거로 쓰지 않는다

---

## 2. Gate 체크리스트 — 항목별 상태

「코드 근거」는 **확인한 코드**이고 통과 근거가 아니다. 「절차」는 3절의 단계 번호다. **판정은 2차(6절) 기준**이다 — 1차는 Mock 만 통과였다.

> **이 표는 `4494f52` 기준 2차 판정이다. 현재 판정은 8-4 가 정본이다** — 바뀐 줄이 6개 있다.

| 항목 | 판정 | 코드 근거 | 실측 필요 → 절차 |
| --- | --- | --- | --- |
| **Auth / User** | 미검증 → 6-2 S1 · S8 (로컬 통과 · 실제 provider 창 취소만 남음) | `users` · `oauth_accounts`(PK = `provider + provider_account_id`) · `auth_sessions`(`token_hash` unique) · **이메일 · OAuth token 컬럼 없음**(`schema.ts:27-31` 주석 · 컬럼 목록) · 세션은 기기 행 단위 | 실제 Kakao · Google 로그인 · 취소 · 재로그인 동일 UID · 로그아웃 기기 세션 무효 · 다기기 → **S1 · S2 · S8** |
| **Signup / Consent / Nickname** | **미통과** → F3 | `consents` unique(user, type, version) · `users_nickname_lower_unique`(대소문자 무시) · `NICKNAME_MIN/MAX_LENGTH = 2 / 10`(D4) | 동의 persist · 중복 닉네임 서버 거절 · 가입 중 재개 · 수정 persist → **S1** |
| **Root Routing** | **통과** → 6-2 S1 · S2 | `app/page.tsx` — 로그아웃 → `/login` · 가입 중 → 동의 유무로 `/signup/consent` · `/signup/nickname` · active → `/running` · 그 외 `/home`. **로그아웃 갈래만 실측**(1-2) | 가입 중 · active 갈래 → **S1 · S2** |
| **Location / GPS** | 미검증 → 6-2 S2 · S9 (화면 꺼짐 구간 · 실기기 GPS 남음) | `useGeolocationReady` · `useRunTracker`(D10 accept 필터 · `visibilitychange → hidden` 시 watch 정리 `:588-621` · Wake Lock best-effort) · 판정 함수 `fix.test.ts` 12 | 실제 권한 요청 · denied · 끊김 · P1 · P2 · P3 · hidden 복귀 새 segment → **S2 · S9** |
| **RunSession Start** | **통과** → 6-2 S2 · S3 (사유 코드는 F3) | `run_sessions_active_user_unique`(**status = active 부분 unique index**) · 서버가 viewer 의 active 를 직접 조회(D8) · tracker token 해시 · generation | 중복 시작 거부 · 복원 · active 중 logout 거부 · 다기기 업로드 없음 → **S2 · S3** |
| **Running Measurement** | **미통과** → F2 | 거리 · Zone · 페이스 · P2 · P9 · 경계점은 `src/domain/measure`(테스트 27) · ACK 연속 기준 · 멱등 · `point_conflict`(`ack.ts` · 테스트 23 · #114) | 실제 GPS 로 화면 = 저장값 · P9 구간 제외 · gap 이면 finish 불가 → 복구 → **S2 · S6** |
| **Finish** | **미통과** → F1 · F2 | tx1(rate limit · D13 clamp · 상태 전이) / tx2(모든 generation 으로 확정 · PB · 순위 스냅샷) / tx3(failed 기록) · `ResultRecoveryGate` · 종료 의사 있으면 `/running` → 결과(#116) | 실패 A · 실패 B · 재실행 recovery · GPS 미재시작 → **S4 · S5** |
| **P8 / Concurrency** | **통과** → 6-2 S6 · S7 | D7 정렬 `cumulativeDistance DESC → firstReachedAt ASC` · points 는 `run_sessions FOR UPDATE` 로 직렬화(#114) | 두 계정 동시 종료 · 지연 도착 · 같은 키 다른 값 동시 → **S6 · S7** |
| **Result** | **통과** → 6-2 S2 · S3 | `getResult` 조건 `runSessions.id = ? AND runSessions.userId = ?` · 미인증 307(1-2) | 본인만 · 종료 전 접근 · 실제 수치 · reload → **S2 · S3** |
| **Records** | **통과** → 6-2 S2 · S3 | `ownSaved(userId)` = `userId = ? AND saveState = 'saved'` · 목록 · 합계 · PB · 상세 같은 조건 | 방금 러닝 반영 · 상세 = 결과 · 타인 불가 → **S2 · S3** |
| **Personal Best** | **통과** → 6-2 S2 · S3 | D6 = saved 세션에서 파생(`getPersonalBest`) | 갱신 러닝의 결과 배지 = 기록 PB · 거리 0 → **S2** |
| **Ranking** | **미통과** → F1 | `rankingView` — 공개 필드 닉네임 · 누적 거리 0 제외 · D7 정렬 · 인원 제한 없음 | 실제 누적 · 0km 종료 불변 · 닉네임 변경 반영 · 동점 → **S2 · S7** |
| **Home** | **미통과** → F1 | 닉네임 = `getViewer()` · 요약 = `rankingView` | 실제 값 · active 상태 → **S2** |
| **Settings** | **통과** → 6-2 S2 · S8 · S9 | 닉네임 · 동의 = DB · 권한 = 브라우저 조회 · **로그아웃은 `auth/actions.ts:42` 가 `hasActiveRun` 으로, 탈퇴는 `withdraw.ts` 가 `users FOR UPDATE` 잠금 아래 active 를 다시 조회해** 서버에서 막는다 | 저장 · active 중 서버 차단 → **S8** |
| **Withdrawal** | **통과** → 6-2 S8 | `withdraw.ts` — transaction 안 `users FOR UPDATE` → active 검사 → 삭제. 모든 FK `ON DELETE CASCADE`(consents · run_sessions · oauth_accounts · auth_sessions · route_points · rate_limits) | 테이블별 count 0 · 닉네임 재사용 · 재가입 새 UID · 전 기기 세션 무효 · 실패 롤백 → **S8** |
| **Map(NAVER)** | 미검증 → 6-2 S9 (key 없는 로컬이라 실제 load · ① 남음) | 4화면이 `NaverTancheonMap` 사용 — `home/RunMapCard.tsx` · `running/RunMap.tsx` · `result/[sessionId]/page.tsx` · `records/[sessionId]/page.tsx` · **legacy `TancheonMap.tsx` 없음 · `src` 에 단어 `TancheonMap` 은 주석 2곳뿐** · 실패 시 지도 영역만 안내 | 등록 환경 load · ① load 실패 · ② credential 실패 · 실패 상태로 종료 saved → **S9** |
| **Failure** | **미통과** → F4 (F2 도 해당) | `src/server` 의 `catch` 중 성공 형태를 돌려주는 곳은 `runs/finish.ts:224-225` 두 줄뿐이고 **둘 다 가짜 성공이 아니다** — 동시에 들어온 다른 시도가 이미 `saved` 로 확정한 경우와, `finalization_failed` 상태를 그대로 알리는 경우다. **화면(`src/app`) 쪽 `catch` 는 전수 확인하지 않았다** | 각 operation 실패 주입 → **S4 · S5 · S9** |
| **Mock** | **통과** | 1-1 | — |
| **E2E** | **통과** → 6-2 S2 (로컬) + 사용자 실측 보고 | — | 연속 시나리오 → **S2** |

---

## 3. 실측 절차서

**#89 와 함께, 미뤄 둔 검증을 같은 흐름에서 끝내도록 묶었다** — #114(동시성) · #115(인증 경로) · #116(여기서 종료) · #117(재시도 중복) · #111 QA 10개.
단계 옆 `[#89 항목]` · `[#114]` 등이 그 단계가 채우는 것이다.

### S0. 준비

| 준비물 | 용도 |
| --- | --- |
| **계정 A** — Kakao · **계정 B** — Google | 권한 · 두 계정 동시 · 랭킹 |
| **Chrome 프로필 2개**(P1 · P2), 둘 다 계정 A 로 로그인 가능하게 | 다기기 tracker · 「여기서 종료」 |
| **휴대폰 1대 · 탄천 산책로에서 5~10분 걷기** | **실제 GPS** — P1 · P2 · P3 · 거리 · Zone · 지도 route |
| Neon 콘솔 · `tanchunrun-integration` · SQL Editor | DB 확인(**읽기 전용**) |
| DevTools — Network(offline · request blocking) · Sensors(location) | 실패 주입 · 보조 위치 |

**좌표 — 앱의 `isInZone` 으로 확인한 값**: Zone 안 `37.424078, 127.118255` · `37.525121, 127.067921` / Zone 밖 `37.5665, 126.978`(서울시청)

**DevTools 위치 덮어쓰기의 한계** — 한 점을 고정할 뿐 이동을 만들지 못하고, 보고하는 accuracy 가 **30m 를 넘으면 D10 필터에 걸려 점이 accept 되지 않을 수 있다(미확인).** 거리 · Zone · route 는 휴대폰으로 확인한다.

**기록 규칙** — 스크린샷의 token · 실제 좌표 원본 · 이메일은 가린다. SQL 결과는 id 를 앞 8자리만 남긴다.

### S1. 가입 · 로그인 · 루트 분기 `[Auth · Signup · Root]`

1. P1 · 계정 A(Kakao) 첫 로그인 → `/signup/consent` · 「카카오 계정으로 가입」
2. 동의 후 **탭을 닫고 다시 연다** → `/signup/nickname` 으로 이어지는가(가입 중 재개)
3. 닉네임 1자 · 11자 · 특수문자 → 저장 안 됨 · 사유별 안내 / 2~10자 → `/home`
4. P2 · 계정 B(Google) 가입 · **계정 A 와 대소문자만 다른 닉네임** → 「이미 사용 중」 [서버 중복 · DB unique]
5. 로그인 화면에서 Kakao 창을 **취소** → `/login` 에 취소 안내
6. 계정 A 로그아웃 → 재로그인 → **같은 닉네임 · 가입 절차 없음** [동일 UID]
7. SQL — 이메일 · token 컬럼이 없음을 확인
   ```sql
   SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name ~* '(email|token)' ORDER BY 1, 2;
   -- 기대: 세 줄뿐 — auth_sessions.token_hash(해시) · rate_limits.tokens(bucket 잔량 · 인증 값 아님) · run_sessions.tracker_token_hash(해시)
   ```

### S2. 연속 시나리오 — 휴대폰 · 계정 A `[E2E · GPS · Start · Measurement · Finish · Result · Records · PB · Ranking · Home]`

1. 홈 → GPS ready → 시작 → 카운트다운 → `/running`
2. 탄천 Zone **안**을 5분 이상 걷는다. 중간에 **화면을 2분 끈다**(hidden 구간 제외 · 새 segment · D1)
3. **실내로 들어가거나 비행기 모드**로 GPS 를 끊었다가 복구 → P3 경고 · 복구 뒤 선이 이어지지 않는가(P2)
4. 러닝 중 **reload** · **탭 닫고 재오픈** · `/` 로 들어가기 → 모두 `/running` 복원 [Root active 갈래]
5. 러닝 중 **다른 탭**에서 `/settings` → 로그아웃 시도 → **서버가 막는가** [Start · Settings] — 러닝 화면에는 설정으로 가는 길이 없다(`docs/07-screens.md:56`)
6. 종료 슬라이드 → `/result/{id}` — **거리 · 인정 거리 · 시간 · 페이스를 적어 둔다**
7. `/records` → 같은 세션 → 상세 — **6번과 같은 값 · 같은 route**
8. `/ranking` 본인 줄 · 홈 카드에 인정 거리 반영 · PB 갱신이면 결과 배지 = 기록 PB
9. 각 화면 **reload** → 값 동일 · 로그아웃 → 재로그인 → 값 동일
10. SQL — 화면값과 대조 [Cross-screen consistency]
    ```sql
    SELECT left(id::text, 8) AS id, status, save_state, total_distance_m, tancheon_distance_m,
           duration_sec, avg_pace_sec_per_km, rank_snapshot_kind, pb_flags
      FROM run_sessions ORDER BY started_at DESC LIMIT 3;
    SELECT tracker_generation, count(*) FILTER (WHERE kind = 'measured') AS measured,
           count(*) FILTER (WHERE kind = 'boundary') AS boundary
      FROM route_points WHERE session_id = '<위 세션 전체 id>' GROUP BY 1;
    ```
11. **0km** — 누적이 있는 계정 A 로 Zone **밖**(서울시청 좌표 · DevTools 또는 실제)에서 짧게 러닝 → 종료 → `/ranking` 누적 · 순서 **불변** · PB 는 정상 평가
12. **persistence 표** 작성 — 서버 DB(세션 · 점 · 집계) / 기기 IndexedDB(tracker record · 미ACK 버퍼 · 종료 의사) / sessionStorage(설정 복귀 탭)

### S3. 다기기 · 「여기서 종료」 · 권한 — 데스크톱 P1 · P2 `[Start · Result · Records · #116]`

1. P1 · 계정 A 러닝 시작(Sensors: Zone 안 좌표)
2. P2 · 같은 계정 A → `/running` 이 **read-only · 버튼 2개**(이어서 측정 · 여기서 종료) · P2 Network 에 points · finish 요청 **없음**
3. P2 콘솔에서 token 없이 직접 호출 → **403 `not_tracker`**
   ```js
   await fetch(`/api/runs/${sid}/points`, { method: "POST", headers: { "content-type": "application/json" },
     body: JSON.stringify({ trackerToken: "x", trackerGeneration: 1, points: [] }) }).then(r => r.status)
   ```
4. **#116** P2 「여기서 종료」 → 확인 단계 문구 · **취소에 포커스** → 「종료하기」 → `/result/{sameId}` → **saved**
5. P1 — 다음 업로드에서 read-only 로 바뀌는가 · reload 시 `/home`
6. **#116 탭이 죽는 경우** — 다시 시작해 P2 「종료하기」 직후 **탭을 닫고** 다시 열기 → 결과 화면으로 이어지는가
7. **#116 점 0개** — P1 이 점을 하나도 못 올린 상태에서 P2 종료 → 거리 0 · 페이스 없음 · 랭킹 미반영
8. **권한** — P2 를 **계정 B** 로 바꾸고 계정 A 의 `/result/{id}` · `/records/{id}` → **404** · 콘솔에서 A 세션에 points · finish · retry → 거부
9. **이어서 측정** — 다시 시작해 P2 「이 기기에서 이어서 측정」 → P1 `tracker_superseded` · route 에 P1 이후 점이 섞이지 않음

### S4. 실패 A · 재실행 recovery · 재시도 중복 — 데스크톱 `[Finish · Failure · #117]`

**완전 Offline 으로는 재실행을 확인할 수 없다** — 페이지 자체가 열리지 않는다. 그래서 **API 만 막는다**: DevTools
Network → request blocking 에 `*/api/runs/*` 추가. 화면은 뜨고 업로드 · 종료만 실패한다. **차단은 그 DevTools 가 열린 탭에만
유지된다.**

1. 러닝 중 `*/api/runs/*` 차단 → 종료 슬라이드 → 결과 화면 오류 · Application → IndexedDB `finishIntent` 에 종료 의사 존재
2. **#117** 백오프가 도는 동안 「다시 시도」 **연타** → Network 에 `/points` · `/finish` **중복 요청 없음**(차단된 요청도 목록에 뜬다 — 겹쳐 나가는지만 본다)
3. **같은 탭에서** `/running` 으로 이동하거나 reload → **결과 화면으로 돌아온다** · GPS 재시작 없음(Sensors 좌표를 바꿔도 점이 늘지 않음)
4. 다른 프로필에서 같은 계정 → 서버 `active` · 새 러닝 시작 거부 · 로그아웃 · 탈퇴 **서버 차단**
5. 차단 해제 → flush → **saved** → 같은 id 정상 결과
6. **탭을 닫고 다시 여는 경우** — 1번 상태에서 차단한 채 탭을 닫고, 새 탭(차단 없음)으로 `/running` → 결과 화면으로 이어져 **바로 saved** 가 되는지(#116 이 넣은 이동)
7. **완전 Offline** — 러닝 중 DevTools Offline → 종료 슬라이드 → 결과 화면에 오류 안내(다시 시도) · Online 복구 후 saved

### S5. 실패 B — integration DB trigger `[Finish · Failure]`

> ⚠️ **integration(`summer-bonus-83521166`)에서만.** production 에 절대 실행하지 않는다. 끝나면 반드시 지운다.
> DDL 이라 SQL Editor 의 `Read-only` 토글을 **이 단계에서만** 끄고, 끝나면 다시 켠다.

```sql
-- 1) tx2 의 경계점 INSERT 를 실패시킨다
CREATE OR REPLACE FUNCTION gate_fail_boundary() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'gate: injected finalization failure'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER gate_fail_boundary BEFORE INSERT ON route_points
  FOR EACH ROW WHEN (NEW.kind = 'boundary') EXECUTE FUNCTION gate_fail_boundary();
```

1. Zone 경계를 넘는 러닝을 끝낸다(경계점이 생겨야 trigger 가 걸린다) → 결과 화면 **오류 · 다시 시도**
2. SQL — `status = 'finished'` · `save_state = 'failed'` · 기록 탭 · 랭킹에 **없음**
3. trigger 제거 → 「다시 시도」 → **saved**
   ```sql
   DROP TRIGGER gate_fail_boundary ON route_points;
   DROP FUNCTION gate_fail_boundary();
   ```

### S6. points ACK · 동시성 · 요청 크기 — 콘솔 `[Measurement · P8 · #114 · #115]`

로그인한 탭 콘솔에서 **진행 중 세션 · IndexedDB 의 token** 으로 보낸다. **token 을 출력하거나 기록하지 않는다.**

1. **#114 같은 키 다른 값 동시** — 같은 `rawSeq` 에 `lat` 만 다른 POST 두 개를 `Promise.all` → **200 하나 · 409 `point_conflict` 하나** · SQL 로 그 `raw_seq` 행 **1개**
2. **#114 한 요청 안 중복** — 같은 `rawSeq` 를 다른 값으로 두 번 담은 배열 → **409**
3. 같은 점 재전송 → 200 · ACK 불변 · 순서 섞은 배치 → ACK 는 연속 기준
4. 중간 `rawSeq` 를 빼고 보냄 → ACK 가 빈 자리에서 멈춤 → 종료 → **`409 points_missing` + `expectedNextRawSeq`** · 서버 `active` → 누락분 재전송 → 종료 saved
5. **#115 인증된 상한 초과** — 300KB 문자열 본문 → **413**(헤더 경로). 헤더 없는 경로는 `fetch(url, { method: "POST", body: new Blob([...]).stream(), duplex: "half" })` 로 스트림 업로드 → **413**(Chrome 은 HTTP/2 에서 스트림 업로드를 지원한다 — 안 되면 `미검증`으로 적는다). 정상 크기 업로드 · 종료 **회귀 없음**은 S2 로 확인한다

### S7. 두 계정 동시 종료 · 랭킹 정책 `[P8 · Ranking]`

1. 계정 A · B 가 **같은 인정 거리**가 되게 러닝(또는 기존 누적 활용) → 거의 동시에 종료
2. `/ranking` — 누적 같으면 **firstReachedAt 이른 쪽이 위** · 둘 다 같으면 **공동 순위(1,2,2,4)** · 결과 화면 `rank_snapshot` 은 그 시점 값으로 고정
3. 계정 B 닉네임 변경 → `/ranking` · 홈에 즉시 반영 · 순위 불변

### S8. 설정 · 탈퇴 — **맨 마지막** `[Settings · Withdrawal · Auth]`

1. 계정 B 로 P1 · P2 두 곳 로그인 → P1 에서 탈퇴 확인 단계 → 탈퇴
2. P2 새로고침 → **로그인 화면**(전 기기 세션 무효)
3. SQL — 계정 B 의 흔적 **전부 0**
   ```sql
   SELECT
     (SELECT count(*) FROM users          WHERE id      = '<B uid>') AS users,
     (SELECT count(*) FROM consents       WHERE user_id = '<B uid>') AS consents,
     (SELECT count(*) FROM oauth_accounts WHERE user_id = '<B uid>') AS oauth,
     (SELECT count(*) FROM auth_sessions  WHERE user_id = '<B uid>') AS sessions,
     (SELECT count(*) FROM run_sessions   WHERE user_id = '<B uid>') AS runs,
     (SELECT count(*) FROM rate_limits    WHERE user_id = '<B uid>') AS rate_limits;
   ```
4. `/ranking` 에서 B 사라짐 · 계정 A 가 **B 의 옛 닉네임을 쓸 수 있다**
5. 같은 Google 로 재가입 → **새 UID** · 옛 기록 없음
6. **진행 중 러닝이 있으면 탈퇴 차단** · 오프라인 종료 대기 중(S4 상태)에도 차단

### S9. 지도 · 위치 권한 · #111 QA `[Map · GPS · #111]`

1. 등록 환경(integration) 4화면에서 지도 load · route polyline · Zone polygon · gap 과 generation 경계에서 **선이 끊김**
2. **① load 실패** — request blocking `oapi.map.naver.com` → 지도 자리 「다시 시도」 · **그 상태로 러닝 종료 → saved**
3. **② credential 실패** — **등록하지 않은 hostname** 으로 접속(feature 브랜치 preview URL 등) → 지도 자리 안내 · 측정 · 저장은 동작. 포트만 다른 URL 은 실패를 보장하지 않는다
4. 390px · 320px · 회전 · resize 에서 가로 넘침 없음
5. **#111 QA 10개** — 체크리스트 원문대로(홈 GPS 재시도 #119 · denied UI #124 · 키보드 · 스위치 종료 #120 · pointer cancel #120 · 랭킹 미등재 #121 · 기록 0건 #122 · Done/Enter #123 · offline/rate-limit 문구 #125 · 설정 복귀 #127 두 항목)
   - **#120 은 키보드 조작이 2단계로 바뀌었다** — 「끝까지 민 뒤 한 번 더」
   - **#123 은 안드로이드 실기기** 한글 IME 로 확인한다

---

## 4. 이 PR 에서 하지 않은 것

- **코드 변경 없음** — 발견한 문제는 별도 Issue 로 올린다(#89 제외 범위). 6절 F1~F5 도 여기서 고치지 않았다
- `develop → main` 승격 판단 — 담당자

## 5. 실측 후 할 일

1. ~~3절 결과를 단계별로 이 파일에 덧붙인다~~ — 6절(2차 · 로컬)
2. ~~2절 표의 판정을 갱신한다~~ — 2차 기준으로 갱신
3. ~~0절의 Phase 1 시작 조건 문장을 다시 판정한다~~ — 거짓
4. ~~F1~F5 fix Issue 등록~~ — #144 · #145 · #146 · #147 · #148. **#144 · #145 는 Phase 1 전에 고친다**. 같은 날 기존 후보도 #149~#156 으로 등록
5. **integration · 실기기에서만 남은 것**(6-4) — fix merge 뒤 한 번에 돈다

---

## 6. 2차 실측 결과 — 로컬 (2026-09-17)

### 6-1. 환경 · 방법 · 우회

| 항목 | 내용 |
| --- | --- |
| 코드 | `develop` `4494f52` 를 `git archive` 로 저장소 밖에 풀어 `npm ci` → `npm run build` → `next start` (port 3000) |
| DB | 저장소 밖 임시 PostgreSQL **17.10**(embedded) · `npm run db:migrate` 로 `0000`~`0003` 적용(이력 4행). **integration · production DB 는 건드리지 않았다** |
| env | 셸 env 로만 준다. `APP_ORIGIN=http://localhost:3000` · OAuth 4개는 자리표시자. **`.env.local` 은 읽지도 복사하지도 않았다** — `drizzle.config.ts` 가 `.env.local` 을 먼저 읽기 때문에 사본에는 그 파일이 없다 |
| 브라우저 | Playwright Chromium(headless) · 390×844 기본 · `ko-KR` |
| DB 조회 | 실측 스크립트가 로컬 DB 에 직접 SQL. id 는 앞 8자리만 적는다 |

**우회 세 가지 — 이 결과가 증명하지 않는 것을 분명히 한다.**

1. **OAuth 를 거치지 않았다.** OAuth callback 직후 상태(`users(signing_up)` · `oauth_accounts` · `auth_sessions`)를 `identity.ts` 와
   같은 모양으로 DB 에 만들고 raw token 을 cookie 로 줬다. 가입 · 동의 · 닉네임 이후는 실제 화면으로 진행했다.
   **실제 provider 로그인 · 취소 창은 증명하지 않는다** — 사용자가 integration 에서 가입 · 로그인을 확인했다고 보고했다(6-3).
2. **위치는 에뮬레이터다.** Playwright `setGeolocation` 으로 1.2초마다 3.6m 이동. 에뮬레이터 artifact 두 가지를 보정했다 —
   ⓐ 좌표를 바꿀 때마다 새 좌표 직전에 `POSITION_UNAVAILABLE`(code 2)을 한 번 보낸다(보정 전에는 점마다 segment 가 끊겨 거리 0) ·
   ⓑ watch 시작 시 override 를 건 시각(수 초 전)을 timestamp 로 준다. 둘 다 init script 로 걸렀고, **GPS 끊김은 accuracy 100m(unusable fix)로 재현**했다.
   ⓑ 를 보정하기 전 결과가 F2 를 드러냈다.
3. **UI 가 막은 경로는 server action 을 직접 불렀다** — 빌드 산출물 `server-reference-manifest.json` 의 action id 로 브라우저 안에서
   `Next-Action` 요청(cookie · Origin 포함). 서버 가드만 보려는 것이다.

**로컬이 대신하지 못하는 것** — Vercel 동작(#115 스트림 상한 · chunked) · NAVER 지도 실제 load(key 없음) · 화면 꺼짐(headless) ·
실기기 GPS · 안드로이드 IME · Safari. → 6-4

### 6-2. 단계별 결과

#### S1 가입 · 로그인 · 루트 분기

| 단계 | 결과 |
| --- | --- |
| 1 첫 로그인 → `/` | ✅ `/signup/consent`. 동의 후 `consents` 1행(`privacy_collection_use` · `2026-09-14`) |
| 2 탭 닫고 재오픈 | ✅ `/signup/nickname` 으로 재개 |
| 3 닉네임 형식 | ✅ 화면: 1자 「2자 이상」 · 특수문자 「특수문자는 사용할 수 없습니다」 · 공백 「공백은 포함할 수 없습니다」 — 모두 버튼 비활성 · 11자는 `maxlength=10` 이 막음. **서버**(action 직접): 11자 · 1자 · 특수문자 · 공백 모두 `format` / 2~10자 → `/home` · `active` · `signed_up_at` 채워짐 |
| 4 대소문자만 다른 중복 | ❌ **DB 는 거절**(unique 위반 · 저장 안 됨)했지만 화면은 「저장에 실패했습니다. 다시 시도해주세요.」, 서버 응답 `failed`(기대 `duplicate`) → **F3** |
| 5 취소 | ✅(분기만) `GET /api/auth/kakao/callback?error=access_denied` → `302 /login?error=cancelled` · 화면 「로그인이 취소되었습니다.」. 실제 provider 창은 미검증 |
| 6 로그아웃 → 재로그인 | ✅ 확인 단계 → `/login` · 그 기기 `auth_sessions` 삭제 · 같은 `(provider, sub)` 로 다시 → **같은 UID** · 가입 절차 없이 `/home` |
| 7 이메일 · token 컬럼 | ✅ 세 줄뿐 — `auth_sessions.token_hash` · `rate_limits.tokens` · `run_sessions.tracker_token_hash` |

#### S2 연속 시나리오

| 단계 | 결과 |
| --- | --- |
| 1 홈 → 시작 → `/running` | ✅ |
| 2 Zone 안 이동 | ✅ 화면 총 거리 · 인정 거리 증가 · 「구역 내」 |
| 2 화면 꺼짐 2분 | **미검증** — headless 는 `visibilitychange` 를 실제로 일으키지 못한다 |
| 3 GPS 끊김 → 복구 | ✅ 「GPS 신호 약함 · 신호가 복구될 때까지 거리를 측정하지 않습니다」 → 복구 뒤 새 segment(저장 segment 0 → 1) |
| 4 reload · `/` · 탭 닫고 재오픈 | ✅ 모두 `/running` 복원 · 거리 이어짐 |
| 5 러닝 중 다른 탭 로그아웃 | ✅ 화면: 버튼 `aria-disabled` + 「진행 중인 러닝을 먼저 종료해 주세요」. **서버**: `signOut` · `withdraw` 모두 `active_session` · 세션 행 유지 |
| 6 종료 → 결과 | ✅ 0.23km · 인정 0.23km · 01:35 · 6'53"/km · 1위 · PB 3종 배지 |
| 7 기록 → 상세 | ✅ 같은 값(기록 탭은 소수 1자리 0.2km) |
| 8 랭킹 · 홈 | ✅ 랭킹 1위 0.2km · 홈 「1위 / 1명 · 0.2」 |
| 9 reload | ✅ 결과 화면 텍스트 동일 |
| 10 SQL 대조 | ✅ `saved` · `total 230` · `tancheon 230` · `95s` · `413s/km` · `rank 1 ranked` · `pb_flags` 3 = 화면값. points 66 · segment 0~3 |
| 11 Zone 밖 0km | ✅ 총 43m · 인정 0 · 「랭킹 미반영」 · `unranked` · `pb_flags` 없음 · **랭킹 누적 · 순서 · firstReachedAt 불변** |
| 12 persistence | 서버 DB — `run_sessions` · `route_points` · 집계는 조회 시 파생 / 기기 IndexedDB `tancheonrun@2` — `tracker`(record) · `points`(미ACK 버퍼) · `finishIntent`(종료 의사). saved 뒤 `points` · `finishIntent` 0 확인(S4) / sessionStorage — 설정 복귀 탭(#127 reload 뒤에도 복귀 확인) |
| — 종료 전 결과 URL | ✅ 본인이 `/result/{active id}` → `/running` 으로 돌려보냄 · 상태 불변 · `/records/{active id}` 404 |

#### S3 다기기 · 「여기서 종료」(#116) · 권한

| 단계 | 결과 |
| --- | --- |
| 2 P2 같은 계정 | ✅ 「다른 기기에서 진행 중」 · 버튼 2개 · P2 의 API 요청 **0** |
| 3 token 없이 직접 | ✅ points · finish 모두 `403 not_tracker` |
| 4 **#116** 여기서 종료 | ✅ 확인 문구 · **포커스 = 취소** · 종료하기 → 같은 id 결과 · `saved` · generation 2 |
| 5 P1 | ✅ 다음 업로드 `403` · reload → `/home`. ❌ **P1 화면에는 8초 뒤에도 안내 없음**(러닝 중 화면 그대로) → **F5** |
| 6 **#116** 탭이 죽는 경우 | ✅ 종료 의사가 IndexedDB 에 남은 순간 탭을 닫고 새 탭 `/running` → 결과 · `saved` · 의사 삭제 — **3/3**. 첫 시도 1회는 검사 스크립트의 IndexedDB 폴링이 연결을 닫지 않은 상태에서 실패했고, 원인을 확정하지는 못했다 |
| 7 **#116** 점 0개 | ✅ P1 업로드를 막은 채 P2 종료 → 점 0 · 거리 0 · 페이스 없음 · `unranked` · 랭킹 누적 불변 |
| 8 권한(계정 B → A) | ✅ `/result/{A}` · `/records/{A}` 404 · points · finish `403 not_tracker` · retry `404 not_found`(saved · active 둘 다) |
| 9 이어서 측정 | ✅ generation 2 · P1 다음 업로드 `409 tracker_superseded` · **인수 뒤 P1 이 보낸 점 0건 저장**(g1 은 인수 전 6점뿐) · P2 종료 saved. P1 화면 안내 없음 → **F5** |

#### S4 실패 A · recovery · #117

| 단계 | 결과 |
| --- | --- |
| 1 `/api/runs/*` 차단 후 종료 | ✅ 결과 화면 「저장하는 중이에요…」 · `finishIntent` 1 · 버퍼 점 5 · 서버 `active` |
| 2 **#117** 「다시 시도」 8연타 | ✅ **동시 in-flight 최대 1** — 요청이 겹치지 않음 |
| 3 같은 탭 `/running` | ✅ 결과로 돌아옴 · 좌표를 바꿔도 버퍼 점 5 → 5(GPS 재시작 없음) |
| 4 다른 기기 | ✅ 서버 `active` · `/` → `/running` · signOut · withdraw `active_session`. 시작은 거절되나 사유 `failed` → F3 |
| 5 차단 해제 | ✅ 4초 뒤 `saved` · 점 13 · 로컬 `finishIntent` · `points` 0 |
| 6 탭 닫고 재오픈 | ✅ 새 탭 `/running` → 결과 · `saved` |
| 7 완전 Offline | ❌ 종료하면 결과 화면 이동이 실패해 **브라우저 오류 페이지**(`chrome-error://`). 온라인 복귀만으로는 저장되지 않고, 사용자가 앱을 다시 열면 결과로 가서 `saved` → **F4**(데이터는 보존) |

#### S5 실패 B — 로컬 DB trigger

| 단계 | 결과 |
| --- | --- |
| 1 경계를 넘는 러닝 종료 | ✅ 「아직 저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.」 · 다시 시도 |
| 2 SQL · 목록 | ✅ `finished` · `failed` · 기록 목록에 없음 · 상세 404 · 랭킹 누적 불변 |
| 3 trigger 제거 → 다시 시도 | ✅ `saved` · 총 173m · 인정 130m · 경계점 1 · trigger 잔여 0 |

#### S6 points ACK · 동시성 · 요청 크기

| 단계 | 결과 |
| --- | --- |
| 1 **#114** 같은 키 다른 값 동시 | ✅ **21회 모두 200 하나 · `409 point_conflict` 하나** · 중복 행 0 |
| 2 한 요청 안 중복 | ✅ `409 point_conflict` |
| 3 같은 점 재전송 · 순서 섞기 | ✅ 동일 값 재전송 200 · ACK 불변 · 행 1 / 섞은 배치 ACK 연속 기준 |
| 4 빈 자리 | ✅ ACK 가 빈 자리에서 멈춤 → finish `409 points_missing` · `expectedNextRawSeq 25` · 서버 `active` → 채우면 ACK 27 → finish `saved` |
| 5 **#115** 인증된 상한 초과 | ✅ 300KB 본문 `413` · finish 8KB `413` · 점 501개 `413 too_many_points`. **스트림 업로드는 미검증** — 로컬은 HTTP/1.1 이라 Chrome 이 보내지 않는다 |

#### S7 두 계정 · 랭킹

| 단계 | 결과 |
| --- | --- |
| 1 거의 동시 종료 | ✅ 둘 다 `saved` · 스냅샷 1위 · 2위 |
| 2 동점 정렬 · 공동 순위 | ❌ **누적이 같은 사용자가 생기는 순간 랭킹 · 홈이 모두 오류 화면** → **F1**. 동점 없는 정렬(거리 내림차순)은 정상 |
| 2b 종료로 동점이 되는 경우 | ❌ **그 러닝이 `finished · failed`** · 동점이 있는 한 다시 시도도 실패 · 동점 사용자를 지우자 다시 시도 → `saved` → **F1** |
| 3 닉네임 변경 | ✅ 저장 → `/settings` · 대소문자만 바꾸기 저장됨. 다른 사람 닉네임(대소문자 차이)으로 변경 → 거절되나 「저장에 실패했습니다」 → F3. 바꾼 닉네임이 랭킹에 바로 표시되고 순위 불변(동점 데이터를 지운 뒤 확인) |

#### S8 설정 · 탈퇴

| 단계 | 결과 |
| --- | --- |
| 1 P1 탈퇴 | ✅ 안내 → 「정말 탈퇴하시겠어요?」 → 탈퇴하기 → `/login` |
| 2 P2 새로고침 | ✅ `/login` |
| 3 SQL | ✅ `users` · `consents` · `oauth_accounts` · `auth_sessions` · `run_sessions` · `route_points` · `rate_limits` **전부 0**(전: 1 · 1 · 1 · 5 · 1 · 15 · 1) |
| 4 랭킹 · 옛 닉네임 | ✅ 랭킹에서 사라짐 · 계정 A 가 옛 닉네임(대소문자 달리) 사용 |
| 5 같은 Google 재가입 | ✅ 새 UID · `signing_up` · 러닝 0 · `/signup/consent` |
| 6 차단 · 롤백 | ✅ 진행 중 · 종료 대기(S4) 모두 `active_session`. `oauth_accounts` 삭제에 실패를 주입 → `failed` · users · oauth · 세션 **모두 유지** · 로그인 유지 |

#### S9 지도 · 권한 · #111 QA

| 단계 | 결과 |
| --- | --- |
| 1 · 2 지도 load · ① load 실패 | **미검증** — 로컬에 NAVER key 가 없다 |
| 3 ② credential 실패 | ✅(로컬판) 모든 지도 자리 「지도를 사용할 수 없습니다」 · **이 상태로 S2~S8 의 모든 러닝이 측정 · 저장됨** |
| 4 가로 넘침 | ✅ 320px · 390px 에서 `/home` · `/ranking` · `/records` · 기록 상세 · 결과 · `/settings` · 위치 · 동의 · 닉네임 · 탈퇴 10경로 **넘침 0**. 회전 · resize 미검증 |
| #119 첫 측위 실패 | ✅ 「GPS 신호 없음」 + 「다시 확인」 → 누르면 시작 버튼 활성 |
| #124 denied | ✅ 홈 「위치 권한을 허용해야 러닝을 시작할 수 있습니다 · 위치정보 설정 보기」 + 비활성 「위치 권한 필요」 / 설정 「권한 필요」 · 허용 버튼 없음 · 「브라우저 설정의 사이트 권한에서 위치를 허용해 주세요」. Safari 미검증 |
| #120 키보드 | ✅ 포커스 + Space 1회 → 끝까지 밀림 · 「한 번 더 누르면 종료」 · 종료 안 됨 / 두 번째 확정 키로 종료(S2~S7 전부 이 방식) |
| #120 pointer cancel | ✅ 드래그 중 49 → `pointercancel` → 0 · 러닝 유지 |
| #121 본인 미등재 | ✅ 「아직 탄천 Ranking Zone 인정 거리가 없어요 · … 달리면 … 랭킹에 올라요 · 달리러 가기」 |
| #122 기록 0건 | ✅ 「아직 기록이 없습니다 · 첫 러닝을 마치면 … · 첫 러닝 시작하기」 |
| #123 Done/Enter | ✅(데스크톱 Enter) 가입 · 수정 모두 제출. **안드로이드 한글 IME 미검증** |
| #125 문구 | ✅ 429 → 「지금은 전송 속도를 잠시 늦추고 있어요 …」 / 네트워크 실패 → 「연결이 원활하지 않아 기록 전송이 미뤄지고 있어요 …」 — 구분됨 |
| #127 설정 뒤로 | ✅ 랭킹 → 설정 → 뒤로 = `/ranking` · 기록 → 설정 → reload → 뒤로 = `/records` · 새 탭 `/settings` → `/home` · 새 탭 `/settings/location` → `/settings` · 설정 → 위치 → 뒤로 = `/settings` |

### 6-3. 사용자 실측 보고 (integration · 2026-09-17)

사용자가 integration 에서 **가입 · 로그인(S1)** 과 **탄천에서의 실제 러닝 → 결과** 를 확인했다고 보고했다. 스크린샷 · SQL 근거는 없다.
세부(화면 꺼짐 · GPS 끊김 · 0km 등)는 보고 범위가 아니라 판정에 쓰지 않았다.

### 6-4. 여전히 integration · 실기기에서만 확인할 수 있는 것

- 실제 Kakao · Google **취소** 창
- **화면 꺼짐 2분**(D1 · hidden 구간 제외 · 새 segment) — 휴대폰
- NAVER 지도 **실제 load · route · Zone polygon · ① load 실패 「다시 시도」**
- **#115 인증된 스트림 업로드** 413 — Vercel(HTTP/2)
- **#123 안드로이드 한글 IME** · **#124 Safari**
- F2 의 **실기기 빈도** — 첫 fix timestamp 가 `started_at` 보다 이른 일이 실제로 생기는가

### 6-5. 결함 — 미통과의 원인

**F1 · 심각 — 누적 인정 거리가 같은 사용자가 생기면 랭킹 · 홈이 전원에게 깨지고, 동점을 만드는 러닝은 저장되지 않는다 → #144**

- 재현: 서로 다른 두 사용자의 `sum(tancheon_distance_m)`(미터 정수)이 같아지게 한다 → `/ranking` · `/home` 오류 화면. 그 상태를 만드는 러닝을 종료하면 `finished · failed` · 다시 시도도 실패
- 원인: `src/server/ranking/index.ts:46` 의 `sql<Date | null>\`max(finished_at) …\`` 은 drizzle node-postgres 에서 **문자열**로 온다. 타입 주석만 `Date` 다. 비교 함수(`:73` · `:84`)가 거리가 같을 때만 `firstReachedAt.getTime()` 을 불러 `TypeError: a.firstReachedAt.getTime is not a function` — 서버 로그로 확인
- 영향: `getLiveRanking`(랭킹 · 홈) · `computeRankSnapshot`(finish tx2). `competitionRank` 단위 테스트는 `Date` 를 넣으므로 통과한다

**F2 · 높음 — 점 하나가 `invalid_recorded_at` 으로 거절되면 그 러닝의 업로드 · 종료가 영구히 막힌다 → #145**

- 재현: `recordedAt < started_at` 인 점이 버퍼 맨 앞에 있게 한다(로컬은 에뮬레이터의 오래된 timestamp 로 발생) → points 가 매번 `400 invalid_recorded_at rawSeq 1` → 화면은 「연결이 원활하지 않아…」로 계속 재시도 → 서버 점 0 · 종료 뒤 결과 「아직 저장하지 못했어요」에서 멈춤
- 원인: 서버 `src/server/runs/points.ts` `outOfRangePoint` 는 미래는 60초 여유, **과거는 `started_at` 그대로(여유 0)**. 배치 전체를 거절한다. 클라이언트 `src/app/running/useRunTracker.ts` flush 는 `point_conflict` 만 그 점을 빼고, **`invalid_recorded_at` 분기가 없어** `offline` 백오프로 같은 배치를 영원히 다시 보낸다
- 실기기 발생 조건(미검증): 기기 시계가 서버보다 늦거나, 첫 fix 의 timestamp 가 `startRun` 시각보다 이른 경우

**F3 · 중간 — DB unique 위반을 알아채지 못한다(`duplicate` · `active_exists` 가 `failed` 로 나간다) → #146**

- 원인: `src/server/db/errors.ts` `isUniqueViolation` 은 `error.code` 만 본다. drizzle-orm `0.45.2` 는 pg 오류를 `DrizzleQueryError` 로 감싸고 원 오류를 `cause` 에 둔다(`node_modules/drizzle-orm/pg-core/session.js`)
- 영향: 닉네임 가입 · 수정 중복 → 「저장에 실패했습니다. 다시 시도해주세요.」(다시 시도해도 실패) · `createRun` 동시 시작 → `failed` · `identity.ts:92` 동시 첫 로그인 재시도 분기 미작동. **중복 자체는 DB 가 막고 있다**

**F4 · 중간(UX) — 완전 오프라인에서 종료하면 브라우저 오류 페이지로 떨어진다 → #147**

- 결과 화면 이동(서버 렌더)이 실패한다. 온라인 복귀만으로는 저장되지 않고 사용자가 앱을 다시 열어야 한다. 종료 의사는 남아 있어 데이터는 보존된다

**F5 · 낮음(UX) — 인수당하거나 다른 기기가 종료한 기기에 안내가 없다 → #148**

- 서버는 `403` · `409` 로 막고 업로드도 멈추지만, 그 기기 화면은 러닝 중 그대로다. reload 해야 `/home` 으로 간다

---

## 7. 그 뒤 — F1 · F2 수정 (2026-09-18)

`develop` = **`2a6e4a9`**(#158 · #159 squash merge · integration 배포 success). 2절 판정표는 **`4494f52` 기준 그대로 둔다** — 항목 판정을 다시 매기는 것은 F3 · F4 까지 고친 뒤 3차에서 한 번에 한다.

### 7-1. F1(#144) — PR #158

- 집계 쿼리의 `firstReachedAt` 에 `mapWith(runSessions.finishedAt)` 을 걸어 컬럼과 같은 매퍼로 `Date` 를 받는다. 원시 `sql` 은 드라이버가 준 timestamptz **문자열**을 그대로 넘겼다
- D7 순위 규칙을 `src/server/ranking/rank.ts`(`server-only` 없는 순수 모듈 · D12 2차)로 떼고 테스트 6개를 더했다 — **동점 경로를 도는 테스트가 그 전에는 하나도 없었다**
- 로컬 재실측: 동점 · 공동 순위가 있는 상태에서 `/ranking` · `/home` 정상 · 화면 순위 **1 · 2 · 2 · 4 · 5** · 종료가 동점을 만드는 러닝도 `saved` · `rank_snapshot = 102` = 같은 DB 에서 SQL 로 계산한 D7 기대값

### 7-2. F2(#145) — PR #159

세 겹으로 막았다(플랫폼 문서의 권장 — 오래된 표본은 timestamp 로 걸러 낸다).

1. `isWithinRunStart`(허용치 60초)로 **거절당할 fix 에 `rawSeq` 를 부여하지 않는다**
2. 서버 수용 범위를 미래(60초)와 **대칭**으로 맞췄다. clamp 하지 않는 원칙은 그대로다
3. 그래도 거절되면 그 점만 버리고, 종료 때 `lastRawSeq` 를 **빈 자리 앞까지**로 보낸다(`finishLastRawSeq`) — 결과 화면 recovery 는 종료 의사의 값도 함께 낮춘다

- 로컬 재실측: 시작 직전 timestamp 기기 → 업로드 전부 200 · 종료 `saved`(수정 전에는 전부 400 · 저장 0 · 종료 불가) · 정상 러닝 회귀 없음 · 서버가 한 점만 계속 거절해도 나머지 저장 + 종료 `saved`
- **새로 생긴 한계** → #160 — 기기 시계가 허용치를 넘게 어긋나면 그 러닝은 0km 로 끝나는데 화면에는 「GPS 신호 약함」으로만 보인다(갇히지는 않는다)
- **#78 D11 과 어긋나는 지점이 있다** → 7-4

### 7-3. integration 확인 (사용자 · 2026-09-18)

merge 뒤 integration 배포에서 **랭킹 · 홈이 뜨고, 짧은 러닝을 돌려 기록이 저장되는 것**을 사용자가 확인했다. 스크린샷 · SQL 근거는 없다.
동점 상태의 랭킹 · F2 재현 조건은 integration 에서 만들지 않았으므로 **그 두 가지는 여전히 로컬 실측 근거뿐**이다.

### 7-4. ledger 와 어긋나는 지점 (미해결)

D11(CONFIRMED)은 ① 시계 허용 상수를 **`src/server/runs` 공용 policy 모듈에 하나만** 두라고 했고, ② **client 가 서버 `started_at` 으로 skew 를 미리 판단하는 동작을 구현 범위에서 뺐고**, ③ 범위 밖 점 때문에 끝낼 수 없게 된 세션의 정리 경로는 **D14 가 닫는다**고 했다.

#145 는 ① 값을 `src/domain/measure` 에 두고 policy 가 그것을 다시 export 하며(client 가 같은 값을 봐야 하는데 `policy.ts` 는 `server-only` 라 import 할 수 없다), ② client 가 `started_at` 으로 fix 를 거르고, ③ 종료 번호를 내려 세션을 끝낼 수 있게 한다.

**D11 을 2차로 갱신하거나 #145 구현을 ledger 에 맞추거나 — 둘 중 하나가 필요하다.** 결정 전까지 이 갈림을 여기 기록만 해 둔다.

---

## 8. 3차 — 회귀 실측 (2026-09-18)

`develop` = **`687637e`**. 2차(6절) 이후 merge 된 것은 아래 8건이다.

| PR | Issue | 무엇 |
| --- | --- | --- |
| #158 | #144 (F1) | 랭킹 동점 `firstReachedAt` 타입 |
| #159 | #145 (F2) | `invalid_recorded_at` 한 점이 러닝을 막던 문제 |
| #161 | #146 (F3) | `isUniqueViolation` 이 drizzle 이 감싼 오류를 못 보던 문제 |
| #170 | #164 | terminal tombstone · `bound` · `maxKnownRawSeq` |
| #186 | #149 | finish tx1 이 세션 행을 잠근 채로 판정 |
| #185 | #150 | 인수당한 뒤 결과 recovery 무한 재시도 |
| #184 | #147 (F4) | 완전 오프라인 종료가 브라우저 오류 페이지로 이탈 |
| #187 | #171 | D11 (A) permanent cleanup 범위 |

(#148(F5)은 2026-09-18 에 닫혔다. #151 · #172 · #173 · #174 · #153 · #118 도 같은 날 들어왔다.)

### 8-1. 환경 · 방법

**저장소 밖에 하네스를 새로 세워 브라우저로 돌렸다.** 로컬에 PostgreSQL 이 없고(`docker` 명령 없음 ·
`localhost:5432` 닫힘) 저장소의 `.env.local` 을 쓰지 않는다.

1. `git archive origin/develop` 을 임시 폴더에 풀고 `npm ci` → `npm run build` → `npx next start -p 3000`.
   **복사본에 `.env.local` 이 없어야 한다** — `drizzle.config.ts` 가 그 파일을 먼저 읽는다
2. `embedded-postgres@17.10.0-beta.17`. **`initdbFlags: ["--encoding=UTF8","--locale=C"]` 가 필요하다** —
   한국어 로케일에서 initdb 가 text search config 를 못 찾아 죽는다. 포트 55432
3. `DATABASE_URL=… npm run db:migrate` (프로젝트 정본 명령) — migration 4개 적용
4. env 는 셸로만 준다. `APP_ORIGIN=http://localhost:3000` · OAuth 4개와 `NEXT_PUBLIC_NAVER_MAP_KEY_ID` 는 자리표시자
5. 로그인은 OAuth 없이 DB 에 직접 심는다 — `users` · `oauth_accounts`(PK `provider` + `provider_account_id`) ·
   `auth_sessions`(`token_hash = sha256(raw)`). 쿠키는 **`tcr_session`**, 값은 raw token
6. **러닝은 홈에서 실제로 시작한다** — `run_sessions` 를 직접 심지 않는다. 그래야 tracker record 가
   IndexedDB 에 진짜로 생기고 8-2 의 5번을 판정할 수 있다
7. Playwright 의 `setGeolocation` 은 timestamp 를 `Date.now()` 로 고정해 시각 시나리오를 만들 수 없다.
   `addInitScript` 로 `navigator.geolocation` 을 바꾸고 `window.__emitFix(lat,lng,ts,acc)` 를 노출시킨다

**하네스 함정 — 가짜 geolocation 에 초기 좌표가 없으면 홈이 「GPS 확인 중」에서 멈춘다.**
`useGeolocationReady` 가 `getCurrentPosition` 을 먼저 부르는데, 콜백을 큐에 담지 않고 좌표가 생길 때만
호출하게 만들면 앱이 영원히 기다린다. 초기 좌표를 넣어 두고 시작해야 한다.

미인증 차단은 하네스에서도 확인했다 — 쿠키 없이 `/records` 는 `307 → /login`, 쿠키가 있으면
`/` 가 `307 → /running`(active 갈래)·`/records` 는 200.

### 8-2. 돌린 것 — 6 / 6 통과

**2차의 전체 절차(S1~S9)를 다시 돌린 것이 아니다.** 오늘 merge 가 건드린 코드에 걸리는 것만 좁혀 돌렸다.
특히 `SlideToFinish.tsx` 는 #120 이 a11y 를 고쳐 둔 파일인데 #147 이 오프라인 분기를 더해서 회귀 위험이 있었다.

| # | 검증 | 결과 | 관찰한 것 |
| --- | --- | --- | --- |
| 1 | #120 keyboard 로 러닝 종료 | 통과 | 슬라이더 포커스 → `End` 로 `aria-valuenow=100` → `Enter` 로 `/result/{id}` 이동. **#147 과의 회귀 없음** |
| 2 | #120 pointer cancel 복귀 | 통과 | 드래그 중 21 → `pointercancel` → **0 으로 복귀** · `/running` 유지 |
| 3 | #147 완전 오프라인 종료 | 통과 | 브라우저 오류 페이지로 **가지 않는다.** 앱 안에 남고 「연결이 끊겨 결과 화면으로 넘어가지 못했어요」 + 「지금 다시 시도」 노출 |
| 3-b | #147 온라인 복귀 | 통과 | `setOffline(false)` → `online` 이벤트로 **자동** `/result/{id}` 이동. 사용자가 앱을 다시 열 필요가 없다 |
| 4 | #150 인수 후 재시도 중단 | 통과 | generation 을 2로 올린 뒤 종료 → **finish 응답 `409` 1회뿐** · 「다른 기기가 이 러닝을 이어받았거나 이미 종료했어요」 · **12초 동안 추가 호출 0회** |
| 5 | #171 `saved` 뒤 정리 | 통과 | 시작 시 tracker record 1건 → `saved` 뒤 **tracker · points · finishIntent 모두 0** |

**4번은 #149 가 아니라 #150 이 막은 것이다.** 인수가 finish **이전**에 일어나면 서버는 잠금과 무관하게
`409` 를 준다. #149 가 고친 것은 판정 직후와 `UPDATE` 사이의 좁은 구간이고, **그 구간은 재현하지 못했다**(8-5).

### 8-3. 2차 결함 F1~F5 의 현재 상태

| 결함 | Issue | 수정 | 수정 후 실측 |
| --- | --- | --- | --- |
| F1 심각 · 랭킹 동점 | #144 | PR #158 | **로컬 재실측 있음**(7-1). integration 에서 동점 상태는 만들지 않았다 |
| F2 높음 · `invalid_recorded_at` | #145 | PR #159 | **로컬 재실측 있음**(7-2) |
| F3 중간 · unique 위반 미판별 | #146 | PR #161 | **재실측 안 함.** 닉네임 중복 · 동시 시작 경로를 이번에 돌리지 않았다 |
| F4 중간 · 오프라인 종료 이탈 | #147 | PR #184 | **오늘 실측 통과**(8-2 의 3 · 3-b) |
| F5 낮음 · 인수당한 기기 안내 없음 | #148 | 2026-09-18 closed | **재실측 안 함** |

### 8-4. 판정 갱신 — 2절 표를 이것으로 대체한다

2절 표는 `4494f52` 기준이다. **현재 판정은 아래가 정본이다.** 바뀐 줄만 적는다.

| 항목 | 2차 판정 | 3차 판정 | 근거 |
| --- | --- | --- | --- |
| **Signup / Consent / Nickname** | 미통과 → F3 | **미검증**(원인 수정됨 · 재실측 없음) | #146 이 `isUniqueViolation` 을 고쳤지만 닉네임 중복 · 가입 재개 경로를 다시 돌리지 않았다. **통과로 올리지 않는다** |
| **Running Measurement** | 미통과 → F2 | **통과(로컬)** | 7-2 의 로컬 재실측. 실기기 GPS · 화면 꺼짐 구간은 여전히 남는다 |
| **Finish** | 미통과 → F1 · F2 | **통과(로컬)** | 7-1 · 7-2 + 8-2 의 1 · 3 · 3-b · 4. **실패 B(S5 · DB trigger)는 integration 몫이라 남는다** |
| **Ranking** | 미통과 → F1 | **통과(로컬)** | 7-1. integration 에서 동점 상태 미확인 |
| **Home** | 미통과 → F1 | **통과(로컬)** | 7-1 |
| **Failure** | 미통과 → F4 | **부분 통과** | F4 는 8-2 의 3 · 3-b 로 통과. **`src/app` 의 `catch` 전수 확인은 여전히 안 했고**, 실패 B 주입도 남았다 |

나머지 줄(Auth · Root Routing · Location/GPS · RunSession Start · P8 · Result · Records · Personal Best ·
Settings · Withdrawal · Map · Mock · E2E)은 **2절 그대로다.**

**전체 판정 — Gate 미통과.** 미통과 줄은 사라졌지만 **「통과」가 전부 로컬 근거**이고, integration ·
실기기 · 실제 OAuth 로만 확인할 수 있는 항목이 그대로 남아 있다(6-4 · 8-5).

### 8-5. 여전히 미검증

**오늘 것**

- **#149 의 좁은 경쟁 구간** — 인가 판정 직후와 `UPDATE` 사이에 인수가 끼어들어 `500` 이 나가던 경로.
  **재현하지 못했고 코드로만 확인했다.** 데드락이 생기지 않는다는 것(`points.ts` 와 같은 잠금 순서)도 정적 확인이다
- **#164 crash-between-writes** — tombstone 과 낮춘 `lastRawSeq` 를 한 transaction 으로 쓰는 경로
  (`markTerminalRawSeq` 의 `finishIntent` 인자)는 **실행되지 않았고 코드로만 확인했다**
- **#171 파생 4건** — ① (A)① 의 finish intent 삭제는 `readFinishIntent` 읽기가 실패하면 조용히 건너뛰고
  던지지도 않는다(원래 있던 동작 · `runBuffer.ts:373`) ② (A)② permanent 404 경로에 로컬 cleanup 호출부가
  없다 ③ `deleteRunData` 의 `.catch(() => null)` 은 실행될 수 없는 dead code ④
  `src/server/account/actions.ts:115` 에 D11 **1차(SUPERSEDED)** 의 번호가 남아 있다. 근거는 PR #187 댓글
- **F3(#146) · F5(#148) 재실측 없음**(8-3)
- 지도는 키가 자리표시자여서 하네스 내내 「지도를 사용할 수 없습니다」 상태로 돌았다. 지도는 이번 검증 대상이 아니었다

**이어지는 것** — 6-4 의 integration · 실기기 목록은 그대로다(실제 OAuth 창 · 실기기 GPS · 화면 꺼짐 구간 ·
실패 B DB trigger · Neon · Vercel 배포 · 다기기 · 탈퇴 삭제).

**그 밖에 관찰** — production DB 에 `run_sessions` 1건인데 `route_points` 0건이다(#180 확인 중).
그 세션이 `active` 면 해당 사용자는 P7 때문에 새 러닝을 시작할 수 없다. **확인하지 않았다.**

→ **확인했다(2026-09-18 · 사용자 · Neon SQL Editor · `begin transaction read only` 로 감싼 조회).**
사용자 id · 닉네임은 읽지 않았다.

| status | save_state | started_at | finished_at | tracker_generation |
| --- | --- | --- | --- | --- |
| `finished` | `saved` | 2026-09-17 05:20:35 UTC | 2026-09-17 05:23:23 UTC | 1 |

- `active` 가 아니다 — P7 로 막힌 사용자는 없다.
- **남는 관찰** — 약 3분 러닝이 `saved` 로 끝났는데 `route_points` 가 0건이다(0건은 2026-09-18 의 count).
  점 없이 저장되는 것이 정상 경로(GPS 를 한 번도 받지 못하고 종료)인지, 점이 사라진 것인지 **확인하지 않았다.**
- SQL Editor 화면에 `Read-only` 토글이 보이지 않아 읽기 전용 transaction 으로 대신했다.

### 8-6. 7-4 의 갈림은 해소됐다

7-4 가 적어 둔 「D11 을 2차로 갱신하거나 #145 구현을 ledger 에 맞추거나」는 **D11 2차(CONFIRMED ·
2026-09-18)로 정리됐다.** 2차 문안이 1차의 다섯 갈래 — ① durable 대상 정의 ② cleanup 조건
③ 시계 허용 상수 위치 ④ client 의 서버 `startedAt` 사용 ⑤ 범위 밖 점으로 끝낼 수 없게 된 세션의
정리 경로 — 를 **명시적으로 대체한다**고 적고 있다. 1차는 SUPERSEDED 다.

### 8-7. 다음

1. **integration 실측** — 6-4 목록. Gate 를 통과로 올리려면 이것 말고 다른 길이 없다
2. F3(#146) · F5(#148) 재실측
3. `src/app` 의 `catch` 전수 확인
4. 8-5 의 #171 파생 4건을 Issue 로 낼지 결정
