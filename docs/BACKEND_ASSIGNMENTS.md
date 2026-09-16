# Backend Assignments

MVP backend 구현 Issue 의 담당·상태 표다. 화면(UI/mock) 구현 이력은 [SCREEN_ASSIGNMENTS.md](./SCREEN_ASSIGNMENTS.md) 를 본다.

- **결정 정본: #78** — Backend 결정 Issue 본문의 canonical decision ledger
- 작업 프롬프트: [CLAUDE_PROMPTS.md](./CLAUDE_PROMPTS.md) 「4. Backend 구현 작업」
- git 흐름(브랜치·커밋·PR·머지): [../CONTRIBUTING.md](../CONTRIBUTING.md)
- 폴더·공용 컴포넌트: [ARCHITECTURE.md](./ARCHITECTURE.md) · 실행·검증 명령: [PROJECT_COMMANDS.md](./PROJECT_COMMANDS.md)

## 이 표를 믿는 범위

> **이 문서는 snapshot / cross-check 전용이다.** 착수 가능 여부는 이 표가 아니라 아래 순서로만 판정한다.
>
> 1. 배정 Issue **본문의 Status**
> 2. 「선행」의 merge 대상 Issue 마다, 그 Issue 본문의 **canonical branch PR merge commit 이 `origin/develop` 에 포함**됐는지
> 3. **#78 본문 ledger** 에서 필요한 D 가 모두 `CONFIRMED` 인지

- 1~3 을 모두 통과했는데 이 표가 `BLOCKED` 면 작업을 막지 않고 "BACKEND_ASSIGNMENTS 가 GitHub Issue 와 불일치 — 문서 stale" 만 보고한다.
- 반대로 Issue 본문이 `BLOCKED` 면 이 표가 `READY` 여도 **BLOCKED** 다.
- 선행은 Issue 가 open/closed 인지로 판단하지 않는다. 이슈는 `develop` → `main` 승격 PR 에서 닫으므로, develop 에 이미 들어간 작업의 이슈도 한동안 open 이다.
- Status 는 담당자(오케스트레이터)만 바꾼다. **Issue 본문을 먼저 고친 뒤** 이 표를 맞춘다.
- 「선행」 칸은 각 Issue 본문 「선행」의 `READY 조건` 문자열을 **그대로** 옮긴 것이다. 요약하거나 다시 해석하지 않는다.
- canonical branch 는 번호에서 추론하지 말고 Issue 본문 「Branch / PR」 값을 쓴다. #89 만 `chore/` 다.

## 담당 표

| Symbol | Issue | 제목 | Status | 선행 | 담당 | canonical branch | Downstream |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B0 | #78 | Backend 결정 Issue: platform · 인증 스택 · 데이터 정책 확정 | decision-only | decision-only · 구현 프롬프트 미사용 | — | (없음) | 전체 |
| B1 | #79 | DB·인증 기반: User + 계정 연결 + OAuth + 로그인 유지 + 로그아웃 | MERGED | `merge: 없음 · CONFIRMED: D1 · D2 · D3-A · D12` | — | `feat/79-auth-db` | #80 |
| B2 | #80 | 가입 동의·최초 닉네임·닉네임 수정·루트 인증 분기 | MERGED | `merge: #79 B1 · CONFIRMED: D5` | — | `feat/80-signup-nickname` | #81 |
| B3 | #81 | 위치 권한·GPS ready + RunSession 시작·유지·복원 + P12 로그아웃 서버 차단 | MERGED | `merge: #80 B2 · CONFIRMED: D1 · D8 · D14` | — | `feat/81-run-session-start` | #84 · #83 · #88 |
| B4a | #82 | 측정 계산 domain(WGS84 · P2 · P5 · P9 · R11 · 페이스) + 검증 러너 | MERGED | `merge: 없음 · CONFIRMED: D9 · D10 · D12` | — | `feat/82-measure-domain` | #84 · #83 |
| B4c | #84 | NAVER Maps 공용 지도 컴포넌트 추가 + 홈 지도 전환 (점진적 migration) | MERGED | `merge: #81 B3 · #82 B4a · CONFIRMED: D1 · D3-B` | — | `feat/84-naver-map` | #83 · #85 · #86 |
| B4b | #83 | 러닝 실측: GPS 수집·업로드·오프라인 버퍼·실시간 표시·running 지도 전환 | MERGED | `merge: #81 B3 · #82 B4a · #84 B4c · CONFIRMED: D1 · D10 · D11 · D14` | — | `feat/83-run-tracking` | #85 · #86 |
| B5 | #85 | 러닝 종료(F6) 2단계 처리 + 결과 화면 실데이터(F9) + P14 recovery | **READY** | `merge: #83 B4b · #84 B4c · CONFIRMED: D6 · D7 · D13 · D14` | — | `feat/85-run-finish-result` | #86 · #87 · #88 |
| B6 | #86 | 기록 탭·기록 상세·개인 최고 기록 실데이터 + legacy 지도 삭제 | BLOCKED | `merge: #83 B4b · #84 B4c · #85 B5 · CONFIRMED: D6` | — | `feat/86-records-data` | #89 |
| B7 | #87 | 누적 랭킹·홈 요약 실데이터 | BLOCKED | `merge: #85 B5 · CONFIRMED: D6 · D7` | — | `feat/87-ranking-home-data` | #89 |
| B8 | #88 | 설정 실데이터·회원 탈퇴 transaction·로그아웃 통합 | BLOCKED | `merge: #81 B3 · #85 B5 · CONFIRMED: D11` | — | `feat/88-settings-withdraw` | #89 |
| B9 | #89 | MVP 전체 통합·실패·E2E 안정화 + MVP Backend Completion Gate 판정 | BLOCKED | `merge: #86 B6 · #87 B7 · #88 B8 · CONFIRMED: D3-A · D3-B` | — | `chore/89-mvp-backend-gate` | Gate 판정(통과 시 담당자가 승격·Phase 1 판단) |

**담당 칸은 비어 있다. READY 가 된 Issue 부터 담당자가 배정한다.**

## 지금 상태 (2026-09-16 snapshot · `origin/develop` = `175dca4`)

- **결정(D)으로 막힌 Issue 는 하나도 없다.** #78 ledger 는 `CONFIRMED 16 · OPEN 0 · SUPERSEDED 1`(D12 1차)이다. 남은 것은 전부 **merge 선행**이다.
- develop 에 들어간 구현: **#79 · #80 · #81 · #82 · #84 · #83**(순서대로 squash `e80fd7e` · `e1395e3` · `401478a` · `9798339` · `e0f1ef4` · `175dca4`). 승격 PR 전까지 Issue 는 open 으로 남는다.
- **지금 착수 가능한 것은 #85 하나다.** 나머지 넷은 #85 를 기다린다.

```
#85  →  { #86 · #87 · #88 }  →  #89
```

- **#85 가 merge 되면 #86 · #87 · #88 셋이 한꺼번에 열린다** — 세 명이 동시에 붙을 수 있는 지점이라, 그 전까지는 #85 가 전체 일정의 병목이다.
- 아직 브랜치가 없는 Issue: #85 · #86 · #87 · #88 · #89.
- B 트랙과 **병렬로 가능한 작업**(merge 선행과 무관):
  - #79 의 DB · OAuth 실검증 — 빈 `postgres:17` 에 migration `0000`~`0003` 순차 적용 + 로그인 1회. #92 merge 시점에 수행하지 못했고 **#89 전에 반드시 필요**하다
  - NAVER Console 의 integration · production Web 서비스 URL 등록과 Vercel env(#78 D3-B · PR #96 본문 상단)
  - `.env.example` 에 `NEXT_PUBLIC_NAVER_MAP_KEY_ID` 이름 추가(값 없이)
  - Vercel Deployment Protection — develop branch alias 가 SSO 뒤라 #89 의 integration 검증이 막힌다
- 이 절은 snapshot 이라 금방 낡는다. **현재 값은 #78 본문 ledger 와 각 Issue 본문에서 확인한다.**

## B0(#78)는 구현 Issue 가 아니다

- decision-only Issue 다. branch · 코드 · PR · 저장소 파일 변경이 없다.
- CLAUDE_PROMPTS 의 backend **구현** 공통 프롬프트를 #78 에 쓰지 않는다. 결정 정리는 같은 문서의 B0 전용 짧은 프롬프트를 쓴다.
- 결정이 바뀌면 담당자가 **#78 본문 ledger 를 먼저** 갱신하고, 영향 Issue 본문과 이 표를 뒤따라 맞춘다. 과거 댓글과 ledger 가 다르면 ledger 가 우선이다.

## 화면 이슈(#37~#51)와의 관계

- 화면 이슈는 **UI/mock 구현 이력**이다. backend Issue 로 재사용하거나 AC 를 backend 요구로 덮어쓰지 않는다.
- 이어받는 관계는 아래와 같다. 화면 이슈의 상태는 [SCREEN_ASSIGNMENTS.md](./SCREEN_ASSIGNMENTS.md) 에 있다.

| 화면 이슈 | 이어받는 backend Issue |
| --- | --- |
| #29 로그인 | #79 |
| #37 가입 동의 · #38 동의 상세 · #39 닉네임 · #51 닉네임 수정 | #80 |
| #40 러닝 진행 | #81(시작·복원) · #83(실측·지도 전환) · #85(종료) |
| #41 결과 | #85 |
| #42 홈 달리기 탭 | #81(GPS·active) · #84(지도) · #87(요약) |
| #43 랭킹 탭 | #87 |
| #44 기록 탭 · #45 기록 상세 | #86 |
| #46 설정 · #47 위치정보 · #49 동의 보기 · #50 회원탈퇴 | #88 (로그아웃 서버 차단은 #81) |
