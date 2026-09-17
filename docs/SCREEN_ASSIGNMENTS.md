# Screen Assignments

누가 어느 화면을 맡는지, 그 화면의 디자인 원본이 어디인지 적는 표다.

- **Claude Code 로 바로 시작하기: [CLAUDE_PROMPTS.md](./CLAUDE_PROMPTS.md)** ← 복사해 붙여 넣는 프롬프트
- 만드는 방법: [ARCHITECTURE.md](./ARCHITECTURE.md)
- 실행·검증 명령: [PROJECT_COMMANDS.md](./PROJECT_COMMANDS.md)
- git 흐름(브랜치·커밋·PR·머지): [../CONTRIBUTING.md](../CONTRIBUTING.md)
- **backend 구현 담당·상태: [BACKEND_ASSIGNMENTS.md](./BACKEND_ASSIGNMENTS.md)** ← 인증 · 세션 · GPS · 저장 · 랭킹 연동은 이 문서가 아니라 저기다

이 문서는 **화면(UI/mock) 구현 이력·담당 문서**다.

**구현 기준은 기획 문서가 아니라 캡처된 디자인이다.** 루트 `탄천런.dc.html` 을 브라우저로 열면 실제 화면을 볼 수 있고, 아래 「디자인 줄」은 그 파일에서 해당 화면의 마크업 위치다.

## 시작하기 전에

```bash
git fetch origin
git switch develop
git pull --ff-only origin develop
npm install
npm run dev
```

`docs/` 아래 기획 문서는 **후순위**다. 문서와 디자인이 어긋나면 디자인을 따르고 `modify/` 에 기록한다.

## 담당 표

**담당 칸은 비어 있다. 팀 회의에서 채운다.**

| 화면 | 디자인 줄 | route | 묶음 | 이슈 | 담당 | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| 로그인 | 33–94 | `/login` | — | #29 | — | ✅ 완료 |
| **[공용] 지도** | `TancheonMapBrand.dc.html` | `components/shared/` | **선행** | #33 | | ✅ 완료 |
| **[공용] 하단 탭바** | 921–937 | `components/shared/` | **선행** | #34 | | ✅ 완료 |
| 가입하기(약관 동의) | 95–135 | `/signup/consent` | A | #37 | | ✅ 완료 |
| 개인정보 수집·이용 동의 상세 | 136–167 | `/signup/consent/detail` | A | #38 | | ✅ 완료 |
| 프로필 설정(닉네임) | 168–198 | `/signup/nickname` | A | #39 | | ✅ 완료 |
| 러닝 진행 | 207–297 | `/running` | B | #40 | | ✅ UI/mock develop 통합 · backend 는 BACKEND_ASSIGNMENTS |
| 결과 | 298–374 | `/result/[sessionId]` | B | #41 | | ✅ UI/mock develop 통합 · backend 는 BACKEND_ASSIGNMENTS |
| 홈 — 달리기 탭 (+3초 카운트다운) | 684–771, 199–206 | `/home` | C | #42 | | ✅ UI/mock develop 통합 · backend 는 BACKEND_ASSIGNMENTS |
| 홈 — 랭킹 탭 | 772–828 | `/ranking` | C | #43 | | ✅ UI/mock develop 통합 · backend 는 BACKEND_ASSIGNMENTS |
| 홈 — 기록 탭 | 829–920 | `/records` | C | #44 | | ✅ UI/mock develop 통합 · backend 는 BACKEND_ASSIGNMENTS |
| 기록 상세 | 628–679 | `/records/[sessionId]` | C | #45 | | ✅ UI/mock develop 통합 · backend 는 BACKEND_ASSIGNMENTS |
| 설정 (+로그아웃·탈퇴 모달) | 375–437, 938–965 | `/settings` | D | #46 | | ✅ 완료 |
| 위치정보 | 438–476 | `/settings/location` | D | #47 | | ✅ 완료 |
| 개인정보처리방침 | 477–530 | `/privacy-policy` | D | #48 | | ✅ 완료 |
| 개인정보 수집·이용 동의(보기) | 531–566 | `/settings/consent` | D | #49 | | ✅ 완료 |
| 회원탈퇴 | 567–594 | `/settings/withdraw` | D | #50 | | ✅ 완료 |
| 닉네임 수정 | 595–627 | `/settings/nickname` | D | #51 | | ✅ 완료 |

**묶음**: A 가입 3개 · B 러닝 2개 · C 홈·기록 4개 · D 설정 6개.

D 가 개수는 많지만 위치정보·개인정보처리방침·동의 보기는 텍스트 화면이라 가볍다. 무거운 건 러닝 진행(90줄)과 홈 기록 탭(90줄)이다.

### 시작 순서

- **A~D 화면 UI/mock 과 공용 선행 #33(지도) · #34(탭바)는 모두 `develop` 에 통합됐다.** 이 절은 끝난 작업의 이력이다.
- 당시 선행은 이슈마다 달랐다 — 지도를 쓰는 #40 · #41 · #42 · #45 는 #33, 탭바를 쓰는 #42 · #43 · #44 는 #34. 추천 순서는 #41 · #43 · #44 → #40 · #45 → #42 였다.
- 실제 backend 연동(인증 · 세션 · GPS · 저장 · 랭킹)은 화면 이슈를 재사용하지 않고 **backend track 이슈**로 진행한다 — [BACKEND_ASSIGNMENTS.md](./BACKEND_ASSIGNMENTS.md).
- 화면 이슈(#37~#51)의 AC 와 제외 범위는 당시 UI/mock 구현 범위의 기록으로 유지한다.
- 이 문서와 이슈 본문이 어긋나면 **이슈 본문이 최신**이다.

## 충돌 방지

### 마음껏 건드려도 되는 곳

**자기 `src/app/<route>/` 폴더 안**. 그 화면에서만 쓰는 조각도 같은 폴더에 둔다. 여기서는 절대 충돌하지 않는다.

### 건드리기 전에 말해야 하는 곳

| 파일 | 왜 |
| --- | --- |
| `src/app/globals.css` | 토큰을 전량 추출해 뒀으니(#30) 건드릴 일이 없어야 정상이다. 없는 값이 필요하면 먼저 말한다 |
| `src/components/shared/*` | 공용 컴포넌트. 수정은 **별도 PR** 로 분리하고 먼저 공유한다 |
| `src/app/layout.tsx` | 모든 화면에 걸린다 |
| `src/app/page.tsx` | `/` 는 인증 분기 자리다(지금은 `/login` 으로 redirect). 홈 달리기 탭은 `/home`(#42)이라 화면 PR 에서 이 파일을 고치지 않는다 |
| `package.json` | 라이브러리 추가는 사전 합의 |
| `tsconfig.json` · `next.config.ts` · `eslint.config.mjs` | 전원 공유 |

### 인증(OAuth)은 화면 작업이 아니다

카카오·구글 연동은 루트 `page.tsx` 등 공유 인프라를 건드린다. 화면 브랜치에 섞으면 전원과 충돌한다. **backend track 의 #79(DB·인증 기반)에서 구현하고, 루트 인증 분기는 #80 이 맡는다** — [BACKEND_ASSIGNMENTS.md](./BACKEND_ASSIGNMENTS.md).

로그인 버튼을 눌러도 아무 일도 일어나지 않는 것은 **#79 가 `develop` 에 merge 되기 전까지만** 정상이다.

### `modify/` 는 화면별로 쓴다

`modify/YYYY-MM-DD-<화면>.md`. 예: `modify/2026-09-15-running.md`

날짜만으로 파일을 만들면 같은 날 여러 명이 같은 파일을 고쳐 충돌한다.

## 브랜치와 PR

`CONTRIBUTING.md` 를 따른다. 화면 작업은 전부 `feat/<issue>-<slug>` 다.

```bash
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch -c feat/36-running-screen
```

PR base 는 `develop` 이다. PR 에는 `Refs #36` 을 넣고, **화면 스크린샷을 첨부한다.** 디자인이 기준인 작업이라 리뷰어가 눈으로 봐야 한다.

## 공통 완료 조건

화면 이슈의 Acceptance Criteria 바탕이 되는 4줄이다. **화면별 이슈 본문에 구체적으로 정해진 것(Header 사용 여부 · 「상태 정의」)이 이 줄보다 우선한다.**

- [ ] `탄천런.dc.html` 의 해당 줄 범위와 시각적으로 일치한다
- [ ] `AppShell` 을 쓰고, 임의 hex 대신 토큰을 쓴다. 공용 `Header` 는 디자인 상단이 그 구조(sticky · 아래 테두리 · 20px 제목 · 40px 뒤로 가기)와 맞을 때만 쓴다 — 맞지 않으면 화면 폴더 안에 로컬로 그리고 `src/components/shared/*` API 는 바꾸지 않는다
- [ ] 상태를 구분한다 — 실제 loading · empty · error 가 **성립할 때만** 구현한다. 서버/API 요청이 없는 mock 범위에서 가짜 Promise · query error 로 loading/error 를 만들지 않는다. 대신 이슈의 도메인 상태(GPS 확인 중 · 빈 목록 · 랭킹 미반영 · 없는 session id 등)를 구분한다 (`07-screens.md:12` 의 4상태는 이 기준으로 적용)
- [ ] `npm run lint` · `npm run build` 통과

## 알려진 문서 ↔ 디자인 차이

작업 중 새로 발견하면 `modify/` 에 추가한다. 이미 기록된 것:

| 차이 | 기록 |
| --- | --- |
| 탭이 4개(설정 포함)가 아니라 3개 + 홈 헤더 기어 | [modify/2026-09-14.md](../modify/2026-09-14.md) 1번 |
| 로그인 다음에 개인정보 수집·이용 동의 화면이 있다 (문서 F8 에는 없음) | 2번 |
| 로그인 화면에 "개인정보처리방침 보기" 진입이 있다 | 3번 |
| 화면 문구를 디자인 것으로 확정 | 4번 |
| route 경로를 코드에서 확정 (문서는 URL 을 범위 밖으로 둠) | 5번 |
| **홈 달리기 탭 route 가 `/` 가 아니라 `/home`** — `/` 는 인증 전까지 `/login` redirect 자리라 인증 placeholder 와 충돌을 피한 구조 결정 | 이슈 #34 · #42 결정 이력 · [modify/2026-09-15-bottomnav.md](../modify/2026-09-15-bottomnav.md) |
| **닉네임 글자 수** — 문서 9자 이하(`04-features.md:25`) vs 디자인 2~10자(L192) | 이슈 #39 · #51 참고. 구현 시 `modify/` 에 기록 |
| **개인정보처리방침 절 번호에 5번이 없다** (1·2·3·4·6·7·8·9) | 이슈 #48 참고 |
