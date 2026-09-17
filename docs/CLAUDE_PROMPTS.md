# Claude Code 프롬프트 모음

각자 자기 세션에서 **그대로 복사해 붙여 넣는** 프롬프트다. `<>` 안만 자기 것으로 바꾼다.

저장소 루트에서 `claude` 를 실행하면 `CLAUDE.md` 가 `docs/ARCHITECTURE.md` 와 `docs/PROJECT_COMMANDS.md` 를 자동으로 읽는다. 그래서 프롬프트에 폴더 규칙이나 토큰 이름을 다시 적을 필요가 없다.

> **§1 · §2 는 화면(UI/mock) 구현 시기의 historical 프롬프트다.** backend 구현(인증 · 세션 · GPS · 저장 · 랭킹)은 **아래 §4 Backend 구현 작업**을 쓴다. 담당 · 상태는 [BACKEND_ASSIGNMENTS.md](./BACKEND_ASSIGNMENTS.md).

---

## 0. 받은 직후 한 번만

```
이 저장소를 처음 받았어. 아래를 순서대로 확인하고 결과만 짧게 알려줘.

1. 지금 branch 와 working tree 상태
2. npm install 이 되어 있는지, 안 되어 있으면 설치
3. npm run lint 와 npm run build 가 통과하는지
4. npm run dev 로 띄웠을 때 http://localhost:3000 이 로그인 화면으로 가는지

문제가 있으면 원인만 알려주고 임의로 고치지는 마.
```

---

## 0-1. develop 전환 후 — 기존 로컬 저장소에서 이어서 시작

2026-09-15 부터 `feature → develop → main` 이다(`CONTRIBUTING.md` §0). 이미 받아 둔 저장소가 `main` 에 있으면 아래를 **한 번** 붙여 넣은 뒤 §1 로 이슈를 시작한다.

```
이 저장소의 git workflow 가 feature → develop → main 으로 바뀌었어. 내 로컬을 새 흐름에 맞춰줘.
아래 순서대로 하고 단계마다 결과를 짧게 보여줘. 예상과 다르면 멈추고 알려줘.

1. git status 로 working tree 가 깨끗한지 확인해. 커밋하지 않은 변경이 있으면 아무것도 하지 말고 알려줘.
2. git switch main 후 git pull --ff-only origin main 으로 main 을 최신화해.
3. git fetch origin --prune 후 git switch develop 으로 develop 으로 넘어가(origin/develop 을 추적하는 로컬 branch 가 생긴다).
   이미 로컬 develop 이 있으면 git pull --ff-only origin develop 으로 최신화해.
4. CONTRIBUTING.md §0 · §1 · §4 와 docs/SCREEN_ASSIGNMENTS.md 「시작 순서」를 읽고 바뀐 규칙을 세 줄로 요약해.
5. npm install 후 npm run lint · npm run build 가 통과하는지 확인해.

지킬 것:
- main · develop 에서 직접 커밋하지 마. 작업은 develop 에서 새 branch 를 만들어 해.
- force push · rebase · reset --hard 는 하지 마.
- merge 는 하지 마. 병합은 담당자가 한다.
```

---

## 1. 화면 작업(historical · UI/mock 범위) — backend 작업에 쓰지 않는다

아래 프롬프트는 화면 UI/mock 을 만들던 시기의 것이다. 내용은 이력으로 보존한다. 이 절의 "서버가 없으니 데이터는 mock 으로 만들어"는 **backend 작업에 적용하지 않는다** — backend 는 §4 를 쓴다.

`<이슈번호>` 와 `<슬러그>` 두 군데만 자기 것으로 바꾼다. 슬러그는 짧은 영문 kebab-case (`running-screen`, `settings-nickname` 처럼).

```
GitHub 이슈 #<이슈번호> 를 구현할 거야.

시작 전에:
1. `gh api repos/NextComm1T/tanchunrun/issues/<이슈번호> --jq .body` 로 이슈 전문을 읽어
   (이 저장소는 `gh issue view` 가 GitHub Projects classic 지원 종료 오류로 실패해).
   구현 범위 · Acceptance Criteria · 제외 범위 · 결정 이력이 거기 다 있어.
2. 이슈에 적힌 `탄천런.dc.html` 줄 범위를 직접 읽어. 그 마크업이 구현의 기준이야.
3. docs/SCREEN_ASSIGNMENTS.md 의 충돌 방지 규칙을 확인해.
4. 이미 있는 src/app/login/ 을 읽어. 같은 방식으로 만들면 돼.

작업 규칙:
- develop 을 최신화한 뒤 feat/<이슈번호>-<슬러그> branch 를 새로 만들어.
- 내 화면 폴더 안에서만 작업해. src/app/globals.css, src/components/shared/*,
  src/app/layout.tsx, package.json 은 건드리지 마 — 필요하면 먼저 나한테 말해.
- 색·크기는 globals.css 토큰만 써. 임의 hex 를 새로 쓰지 마.
- 서버가 없으니 데이터는 mock 으로 만들어. 가짜 성공/실패로 동작을 흉내내지는 마.
- 공용 Header 사용 여부와 상태(loading · empty · error · 도메인 상태)는 이슈 본문에 정해진 대로만 해.
  이슈에 없는 loading/error 를 가짜 Promise 나 query 로 만들지 마.
- 디자인이 기획 문서와 다르면 문서를 고치지 말고
  modify/<오늘날짜>-<화면>.md 에 「문서가 말하는 것 / 실제로 한 것 / 고쳐야 할 문서 위치」 세 줄로 기록해.

다 만들면:
- npm run lint 와 npm run build 를 돌리고 결과를 보여줘.
- npm run dev 로 실제로 띄워서 화면이 나오는지 확인해줘.
- 검증 안 한 건 했다고 하지 말고 그대로 말해줘.

먼저 계획을 짧게 보여주고 시작해.
```

### 묶음별 이슈 번호

| 묶음 | 이슈 |
| --- | --- |
| A 가입 | #37 가입하기 · #38 동의 상세 · #39 프로필 설정 |
| B 러닝 | #40 러닝 진행 · #41 결과 |
| C 홈·기록 | #42 홈 달리기 탭 · #43 랭킹 탭 · #44 기록 탭 · #45 기록 상세 |
| D 설정 | #46 설정 · #47 위치정보 · #48 개인정보처리방침 · #49 동의 보기 · #50 회원탈퇴 · #51 닉네임 수정 |

**A~D 화면 UI/mock 과 공용 선행 #33 · #34 는 모두 `develop` 에 통합됐다.** 당시 선행은 이슈마다 달랐고(지도 #33 · 탭바 #34), 추천 순서는 #41 · #43 · #44 → #40 · #45 → #42 였다 — 여기까지는 끝난 작업의 이력이다. 실제 backend 연동은 화면 이슈를 재사용하지 않고 backend track 이슈로 진행한다 — §4 와 [BACKEND_ASSIGNMENTS.md](./BACKEND_ASSIGNMENTS.md).

---

## 2. 선행 공용 컴포넌트 (#33 · #34) — ✅ 완료

> historical — backend 작업에 쓰지 않는다. 이 절의 "서버나 외부 SDK 없이"는 backend 공용 컴포넌트(예: #84 의 NAVER 지도)에 적용하지 않는다.

**#63 · #64 로 머지됐다.** 사용법은 `docs/ARCHITECTURE.md` 「공용 컴포넌트」의 `BottomNav` · `TancheonMap` 에 있다. 아래 프롬프트는 앞으로 새 공용 컴포넌트를 만들 때 참고용으로 남긴다.

이 둘은 화면이 아니라 여러 화면이 함께 쓰는 부품이라, 규칙이 조금 다르다.

```
GitHub 이슈 #<33 또는 34> 를 구현할 거야. 이건 화면이 아니라 공용 컴포넌트야.

시작 전에:
1. `gh api repos/NextComm1T/tanchunrun/issues/<이슈번호> --jq .body` 로 이슈 전문을 읽어.
2. 이슈에 적힌 디자인 원본을 직접 읽어.
3. 이 컴포넌트를 쓰게 될 화면 이슈들도 훑어봐. props 계약이 그 화면들을 다 감당해야 해.

작업 규칙:
- develop 최신화 후 chore/<이슈번호>-<슬러그> branch.
- src/components/shared/ 에 만들어. 기존 AppShell · Header · BackButton 의
  스타일과 props 작명 방식을 따라가.
- 서버나 외부 SDK 없이, 넘겨받은 데이터만으로 렌더되게 만들어.
  화면 담당자가 mock 데이터로 바로 붙일 수 있어야 해.
- 색·크기는 globals.css 토큰만 써.
- 다른 화면 폴더는 건드리지 마.

다 만들면:
- npm run lint · npm run build 결과를 보여줘.
- 이 컴포넌트를 어떤 props 로 쓰는지 예시를 보여줘. 화면 담당자들이 그대로 따라 쓸 거야.
- docs/ARCHITECTURE.md 의 공용 컴포넌트 절에 props 계약을 추가해줘.

먼저 계획을 짧게 보여주고 시작해.
```

---

## 3. 작업 중 자주 쓰는 것

### 검증

```
npm run lint 와 npm run build 를 돌리고, npm run dev 로 <route> 를 실제로 띄워서
화면이 디자인대로 나오는지 확인해줘. 결과를 그대로 보여줘.
```

### PR 만들기

```
작업이 끝났어. PR 을 만들어줘.

- .github/PULL_REQUEST_TEMPLATE.md 양식을 그대로 채워.
- 제목은 Conventional Commits 형식.
- base 는 develop 이야. body 에는 `Refs #<이슈번호>` 를 넣어(develop 대상 PR 은 Closes 로 이슈가 자동으로 닫히지 않아).
- 검증 항목은 실제로 한 것만 체크해. 안 한 건 안 했다고 적어.
- 화면 스크린샷은 내가 직접 붙일 테니 자리만 비워둬.
- push 까지만 하고 merge 는 하지 마. 병합은 담당자가 한다.
```

### 문서와 다른 걸 발견했을 때

```
방금 발견한 <무엇> 이 기획 문서와 달라.
기획 문서는 고치지 말고 modify/<오늘날짜>-<화면>.md 에 기록만 해줘.
「문서가 말하는 것(파일:줄) / 디자인·구현이 하는 것(디자인 줄 번호) / 고쳐야 할 문서 위치」
세 줄 형식이야. 기존 modify/2026-09-14.md 를 형식 참고용으로 봐.
```

### 막혔을 때

```
지금 상황을 정리해줘. 무엇을 시도했고 결과가 어땠는지,
원인을 아는지 모르는지 구분해서 알려줘. 추측으로 고치지는 마.
```

### Claude 가 범위를 넘어설 때

```
그건 이번 이슈 범위 밖이야. 지금 작업에는 넣지 말고,
필요하면 별도 이슈 후보로 한 줄만 적어줘.
```

---

## 4. Backend 구현 작업(B0 제외) — `<이슈번호>` 만 바꿔 쓴다

**#79 · #80 · #81 · #82 · #83 · #84 · #85 · #86 · #87 · #88 · #89 backend 구현 이슈 전용이다. 결정 이슈 #78 에는 쓰지 않는다(아래 4-1).**

- 저장소 루트에서 새 Claude Code 세션을 열고 아래를 붙여 넣은 뒤 **`<이슈번호>` 만** 자기 이슈 번호로 바꾼다. 바꾸는 값은 그 하나뿐이다.
- 이슈 본문이 그 이슈의 **현재 구현 계약**이다. 댓글은 참고·이력이며 계약을 바꾸지 않는다.
- Status 가 READY 면 Claude 가 짧은 계획을 출력하고 추가 승인 없이 구현한다. BLOCKED 이면 branch 도 만들지 않고 코드도 건드리지 않고 blocker 만 보고한다.
- 착수 가능 여부의 정본은 ① 이슈 본문 Status ② 선행 canonical branch PR 의 `origin/develop` 포함 여부 ③ #78 본문 ledger 의 D CONFIRMED 다. [BACKEND_ASSIGNMENTS.md](./BACKEND_ASSIGNMENTS.md) 는 대조용이다.

```
B0 를 제외한 MVP Backend 구현 Issue 전용
대상 Issue: <이슈번호>
위 대상 Issue 를 구현한다. 아래에서 "대상 Issue" 는 전부 이 번호를 가리키고,
명령문의 $ISSUE 자리에도 이 번호를 넣어 실행한다(셸에서 ISSUE 변수에 넣고 실행해도 된다).
저장소는 NextComm1T/tanchunrun, backend 결정 정본은 이슈 #78 본문의 decision ledger 표다.

[0단계] Preflight — 읽기만 한다. branch 생성·파일 수정 금지.
1. 현재 폴더가 git 저장소인지 확인하고, 아래 결과가 NextComm1T/tanchunrun 인지 확인해.
   gh repo view "$(git remote get-url origin)" --json nameWithOwner --jq .nameWithOwner
   (저장소 이름이 바뀌어 origin URL 에 예전 이름이 남아 있을 수 있다. URL 문자열이 아니라 이 결과로 판단해.)
2. gh auth status 를 확인하고, 아래 두 명령이 실제로 읽히는지 확인해.
   gh api repos/NextComm1T/tanchunrun --jq .full_name
   gh api repos/NextComm1T/tanchunrun/issues/$ISSUE --jq .number
   저장소가 다르거나 GitHub 읽기가 안 되면 여기서 멈추고 보고해.
3. git status 로 working tree 가 깨끗한지 확인해. 커밋하지 않은 변경이 있으면 멈추고 보고해.
4. 대상 Issue 가 #78 이면 "B0 에는 이 프롬프트를 쓰지 않는다"고 보고하고 멈춰.

[1단계] 읽기 — 현재 구현 계약은 이슈 본문 전체다.
5. 대상 Issue 본문과 댓글을 읽어.
   gh api repos/NextComm1T/tanchunrun/issues/$ISSUE --jq .body
   gh api repos/NextComm1T/tanchunrun/issues/$ISSUE/comments --paginate --jq '.[].body'
   Status · 선행 · 구현 범위 · 제외 범위 · 소유 파일 · 공용 파일 영향 · package/env · Contract · AC · Validation ·
   Branch / PR 을 본문으로만 판정해.
   댓글은 참고·이력이다. 댓글이 본문과 다르면 본문을 따르고 그 차이를 보고해.
6. 이슈 #78 본문의 decision ledger 표를 읽어(댓글은 근거 확인용).
   대상 Issue 「선행」의 D 마다 ledger 의 Status 와 현재 확정값을 표로 정리해. 과거 댓글과 다르면 ledger 를 따른다.
7. CONTRIBUTING.md · docs/PROJECT_COMMANDS.md · docs/ARCHITECTURE.md · docs/BACKEND_ASSIGNMENTS.md 를 읽어.

[2단계] Start Gate — 이 순서로만 판정한다.
8. 대상 Issue 본문 Status 가 BLOCKED 이면 → BLOCKED.
9. 본문 「선행」의 merge 대상 이슈마다, 그 이슈 본문 「Branch / PR」의 canonical branch 이름으로 확인해.
   (branch 이름을 이슈 번호에서 추측하지 마. 본문에 적힌 이름을 그대로 써.)
   gh pr list --repo NextComm1T/tanchunrun --state merged --base develop --head "그 canonical branch 이름" --json number,headRefName,mergeCommit,title
   git fetch origin
   git merge-base --is-ancestor "찾은 mergeCommit 의 OID" origin/develop
   PR 이 없거나 마지막 명령이 실패하면 → BLOCKED.
   branch 이름이 본문에 없을 때만 보조로 --search "Refs #선행이슈번호" 를 쓰고, 그렇게 했다고 보고해.
10. 본문 「선행」의 D 중 하나라도 ledger Status 가 CONFIRMED 가 아니면 → BLOCKED.
11. docs/BACKEND_ASSIGNMENTS.md 는 대조용이다.
    8~10 을 모두 통과했는데 문서 Status 가 다르면 작업을 막지 말고 "BACKEND_ASSIGNMENTS 가 GitHub Issue 와 불일치 — 문서 stale" 경고만 보고해.
    8~10 중 하나라도 BLOCKED 면 문서가 READY 여도 BLOCKED 다.
- BLOCKED 이면 branch 를 만들지 말고 파일도 바꾸지 말고,
  「막고 있는 것 / 근거(실행한 명령과 결과) / 무엇이 끝나면 풀리는지」 표만 보고하고 멈춰.

[3단계] 착수 — READY 일 때만. 별도 승인을 기다리지 않는다.
12. git switch develop 후 git pull --ff-only origin develop.
13. docs/PROJECT_COMMANDS.md 의 설치 규칙대로 의존성을 맞춰(package.json · lockfile 이 바뀌었으면 거기 적힌 install 명령 실행).
    그 뒤 git status 에 예상하지 않은 tracked 파일 변경이 생기면 멈추고 보고해.
14. 이슈 「Branch / PR」의 canonical branch 이름 그대로 새 branch 를 만들어.
15. 짧은 구현 계획을 출력하고, "진행해" 답변을 기다리지 말고 바로 구현을 시작해.

[반드시 멈추고 보고하는 경우] — 구현 중에도 적용한다.
- 이슈 Contract(API · schema · 타입 · route) 변경이 필요할 때
- 이슈 「공용 파일 영향」에 없는 공용 파일(src/components/shared/* · globals.css · layout.tsx · 루트 page.tsx · package.json · 설정 파일) 수정이 필요할 때
- ledger 에서 CONFIRMED 가 아닌 결정이 필요할 때
- 이슈 「package / env」에 없는 dependency, 확정 스택을 대체하는 dependency, 부수 refactor 용 dependency 가 필요할 때
- git conflict · dirty working tree · 예상하지 않은 기존 변경이 있을 때
- 저장소나 GitHub 접근에 문제가 있을 때

[작업 규칙]
- 「구현 범위」와 「소유 파일」 안에서만 작업하고 「제외 범위」는 하지 마.
- dependency: ledger 에서 해당 기술 선택이 CONFIRMED 이고 이슈 「package / env」에 이름이 적힌 package 와 그 package.json 변경은 추가 확인 없이 진행해도 된다.
- mock 이나 가짜 성공으로 동작을 흉내내지 마. production 경로에 fixture · query override 를 남기지 마.
- secret
  · 금지: env 파일(.env.local 등) 내용 출력, OAuth secret · DB password · session token · tracker token 값을 터미널 · PR · Issue · 로그 · 대화에 출력, secret 값 commit, secret 을 NEXT_PUBLIC_ 에 두기
  · 허용: env 파일 존재 여부 확인, 필요한 변수 이름의 설정/미설정 확인(값은 출력하지 않음), .env.example 변수명 수정, 코드에서 token · secret 을 opaque 값으로 처리, 값을 출력하지 않고 성공/실패만 확인
- docs/01~07 은 고치지 마. 문서와 달라지는 결정은 modify/ 에 오늘 날짜와 기능 이름으로 파일을 만들어
  「문서가 말하는 것 / 실제로 한 것 / 고쳐야 할 문서 위치」 세 줄로 기록해.
- git
  · 금지: PR merge, main · develop 에 직접 merge 나 push, rebase, git push --force, --force-with-lease, reset --hard
  · 허용: 작업 중 최신 develop 반영이 필요하면 이 feature branch 에서만 git fetch origin 후 git merge origin/develop
  · merge conflict 가 나면 해결하지 말고 충돌 파일 · 양쪽 변경의 의미 · 이 이슈와 다른 backend 이슈에 주는 영향 · 추천 해결 방향을 보고하고 멈춰.
  · merge 는 담당자가 한다. 팀원은 하지 않는다.

[끝내기 전에]
- npm run lint 와 npm run build 결과를 그대로 보여줘.
- 이슈 「Validation」의 실제 browser · network · DB · GPS 검증을 하고 결과를 보여줘.
- 테스트 러너가 없으면 "테스트 통과"라고 쓰지 마. 검증하지 못한 항목은 미검증으로 적어.
- PR 은 내가 요청할 때만 만들어. base 는 develop, 본문에 대상 Issue 를 Refs #번호 형식으로 넣고, push 까지만 하고 merge 는 하지 마.
```

### 4-1. B0(#78) 결정 작업용 — 구현 프롬프트와 섞지 않는다

#78 은 **decision-only Issue** 다. branch · 코드 · PR · 저장소 파일 변경이 없다. 위 §4 프롬프트를 쓰지 않는다.

```
이슈 #78 는 backend 결정 Issue 다. branch 생성 · 코드 수정 · PR 은 하지 마.
본문 decision ledger 와 댓글을 읽고, 지금 OPEN 인 D 결정마다 선택지 · 근거 · 필요한 spike · 영향 Issue 를 표로 정리해줘.
ledger 본문 수정이나 댓글 작성은 내가 요청할 때만 해. secret 값은 출력하지 마.
```

---

## 주의할 것

- **공용 파일을 건드리라고 하면 멈춰라.** `globals.css` · `components/shared/*` · `layout.tsx` · `package.json` 은 전원이 공유한다. Claude 가 "토큰을 추가하겠다"거나 "AppShell 을 고치겠다"고 하면 팀에 먼저 말한다.
- **"테스트 완료"를 그대로 믿지 마라.** 이 프로젝트에 테스트 러너는 없다. lint · build · 브라우저 확인 세 가지뿐이다.
- **merge 는 담당자만 한다.** 팀원은 push · PR 까지만 한다. PR 병합(`develop` 머지 · `develop` → `main` 승격)은 담당자(@wol20670) 노트북에서만 진행한다.
- **로그인 버튼 no-op 은 #79 가 `develop` 에 merge 되기 전까지만 정상이다.** OAuth 는 화면 작업이 아니라 backend track 의 #79(DB·인증 기반)에서 구현한다. #79 merge 이후에도 눌리지 않으면 버그다.
