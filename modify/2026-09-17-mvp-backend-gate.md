# 2026-09-17 — MVP Backend Completion Gate 판정 기록 (#89)

> 기준: `origin/develop` = `4494f52`(#139 · #140 · #141 · #142 반영) · integration 배포
> `https://tanchunrun-git-develop-wol20670s-projects.vercel.app` · Neon integration `summer-bonus-83521166`.
> 이 파일은 **판정 기록**이다. 기획 문서(`docs/01~07`)는 고치지 않았다.

## 0. 판정 요약 — 1차 (실측 전)

| 구분 | 수 |
| --- | --- |
| 통과 | **1** — Mock |
| 미통과 | **0** |
| 미검증(사유) | **18** — 실측(실제 OAuth · 실제 GPS · 두 계정 · 두 기기 · 실패 주입) 전 |

**Phase 1 시작 조건 문장의 판정: 거짓(현재).**

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

「코드 근거」는 **확인한 코드**이고 통과 근거가 아니다. 「절차」는 3절의 단계 번호다.

| 항목 | 판정 | 코드 근거 | 실측 필요 → 절차 |
| --- | --- | --- | --- |
| **Auth / User** | 미검증 | `users` · `oauth_accounts`(PK = `provider + provider_account_id`) · `auth_sessions`(`token_hash` unique) · **이메일 · OAuth token 컬럼 없음**(`schema.ts:27-31` 주석 · 컬럼 목록) · 세션은 기기 행 단위 | 실제 Kakao · Google 로그인 · 취소 · 재로그인 동일 UID · 로그아웃 기기 세션 무효 · 다기기 → **S1 · S2 · S8** |
| **Signup / Consent / Nickname** | 미검증 | `consents` unique(user, type, version) · `users_nickname_lower_unique`(대소문자 무시) · `NICKNAME_MIN/MAX_LENGTH = 2 / 10`(D4) | 동의 persist · 중복 닉네임 서버 거절 · 가입 중 재개 · 수정 persist → **S1** |
| **Root Routing** | 미검증 | `app/page.tsx` — 로그아웃 → `/login` · 가입 중 → 동의 유무로 `/signup/consent` · `/signup/nickname` · active → `/running` · 그 외 `/home`. **로그아웃 갈래만 실측**(1-2) | 가입 중 · active 갈래 → **S1 · S2** |
| **Location / GPS** | 미검증 | `useGeolocationReady` · `useRunTracker`(D10 accept 필터 · `visibilitychange → hidden` 시 watch 정리 `:588-621` · Wake Lock best-effort) · 판정 함수 `fix.test.ts` 12 | 실제 권한 요청 · denied · 끊김 · P1 · P2 · P3 · hidden 복귀 새 segment → **S2 · S9** |
| **RunSession Start** | 미검증 | `run_sessions_active_user_unique`(**status = active 부분 unique index**) · 서버가 viewer 의 active 를 직접 조회(D8) · tracker token 해시 · generation | 중복 시작 거부 · 복원 · active 중 logout 거부 · 다기기 업로드 없음 → **S2 · S3** |
| **Running Measurement** | 미검증 | 거리 · Zone · 페이스 · P2 · P9 · 경계점은 `src/domain/measure`(테스트 27) · ACK 연속 기준 · 멱등 · `point_conflict`(`ack.ts` · 테스트 23 · #114) | 실제 GPS 로 화면 = 저장값 · P9 구간 제외 · gap 이면 finish 불가 → 복구 → **S2 · S6** |
| **Finish** | 미검증 | tx1(rate limit · D13 clamp · 상태 전이) / tx2(모든 generation 으로 확정 · PB · 순위 스냅샷) / tx3(failed 기록) · `ResultRecoveryGate` · 종료 의사 있으면 `/running` → 결과(#116) | 실패 A · 실패 B · 재실행 recovery · GPS 미재시작 → **S4 · S5** |
| **P8 / Concurrency** | 미검증 | D7 정렬 `cumulativeDistance DESC → firstReachedAt ASC` · points 는 `run_sessions FOR UPDATE` 로 직렬화(#114) | 두 계정 동시 종료 · 지연 도착 · 같은 키 다른 값 동시 → **S6 · S7** |
| **Result** | 미검증 | `getResult` 조건 `runSessions.id = ? AND runSessions.userId = ?` · 미인증 307(1-2) | 본인만 · 종료 전 접근 · 실제 수치 · reload → **S2 · S3** |
| **Records** | 미검증 | `ownSaved(userId)` = `userId = ? AND saveState = 'saved'` · 목록 · 합계 · PB · 상세 같은 조건 | 방금 러닝 반영 · 상세 = 결과 · 타인 불가 → **S2 · S3** |
| **Personal Best** | 미검증 | D6 = saved 세션에서 파생(`getPersonalBest`) | 갱신 러닝의 결과 배지 = 기록 PB · 거리 0 → **S2** |
| **Ranking** | 미검증 | `rankingView` — 공개 필드 닉네임 · 누적 거리 0 제외 · D7 정렬 · 인원 제한 없음 | 실제 누적 · 0km 종료 불변 · 닉네임 변경 반영 · 동점 → **S2 · S7** |
| **Home** | 미검증 | 닉네임 = `getViewer()` · 요약 = `rankingView` | 실제 값 · active 상태 → **S2** |
| **Settings** | 미검증 | 닉네임 · 동의 = DB · 권한 = 브라우저 조회 · **로그아웃은 `auth/actions.ts:42` 가 `hasActiveRun` 으로, 탈퇴는 `withdraw.ts` 가 `users FOR UPDATE` 잠금 아래 active 를 다시 조회해** 서버에서 막는다 | 저장 · active 중 서버 차단 → **S8** |
| **Withdrawal** | 미검증 | `withdraw.ts` — transaction 안 `users FOR UPDATE` → active 검사 → 삭제. 모든 FK `ON DELETE CASCADE`(consents · run_sessions · oauth_accounts · auth_sessions · route_points · rate_limits) | 테이블별 count 0 · 닉네임 재사용 · 재가입 새 UID · 전 기기 세션 무효 · 실패 롤백 → **S8** |
| **Map(NAVER)** | 미검증 | 4화면이 `NaverTancheonMap` 사용 — `home/RunMapCard.tsx` · `running/RunMap.tsx` · `result/[sessionId]/page.tsx` · `records/[sessionId]/page.tsx` · **legacy `TancheonMap.tsx` 없음 · `src` 에 단어 `TancheonMap` 은 주석 2곳뿐** · 실패 시 지도 영역만 안내 | 등록 환경 load · ① load 실패 · ② credential 실패 · 실패 상태로 종료 saved → **S9** |
| **Failure** | 미검증 | `src/server` 의 `catch` 중 성공 형태를 돌려주는 곳은 `runs/finish.ts:224-225` 두 줄뿐이고 **둘 다 가짜 성공이 아니다** — 동시에 들어온 다른 시도가 이미 `saved` 로 확정한 경우와, `finalization_failed` 상태를 그대로 알리는 경우다. **화면(`src/app`) 쪽 `catch` 는 전수 확인하지 않았다** | 각 operation 실패 주입 → **S4 · S5 · S9** |
| **Mock** | **통과** | 1-1 | — |
| **E2E** | 미검증 | — | 연속 시나리오 → **S2** |

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

- **코드 변경 없음** — 발견한 문제는 별도 Issue 로 올린다(#89 제외 범위)
- 실측 전부 — 3절
- `develop → main` 승격 판단 — 담당자

## 5. 실측 후 할 일

1. 3절 결과를 단계별로 이 파일에 덧붙인다 — 근거(스크린샷 · SQL 결과 · Network 캡처)와 함께
2. 2절 표의 판정을 갱신한다
3. 0절의 Phase 1 시작 조건 문장을 다시 판정한다
