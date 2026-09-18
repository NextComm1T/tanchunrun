# Repository Setup Checklist

이 starter를 repo root에 복사한 뒤 아래를 한 번 설정한다.

## 1. 프로젝트 정보 채우기

- [ ] `docs/PROJECT_COMMANDS.md`
- [ ] `docs/ARCHITECTURE.md`
- [ ] `.github/CODEOWNERS`

## 2. GitHub Labels

권장 label:

- `feature`
- `bug`
- `chore`
- `refactor`
- `test`
- `docs`
- `priority:high`
- `blocked`
- `ready-for-review`

Issue template의 label 이름과 실제 repository label 이름을 맞춘다.

## 3. GitHub Ruleset — `main` · `develop`

**2026-09-18 적용 완료**(#118). 아래는 권장이 아니라 **지금 켜져 있는 값**이다.
ruleset 하나(`main · develop 보호 (#118)`)가 두 branch 를 함께 보호한다.

- [x] Require a pull request before merging — **직접 push 가 거부된다**
- [x] Required approvals: **0** — 작성자가 자기 PR 을 merge 할 수 있다
- [x] Dismiss stale approvals when new changes are pushed: **OFF**
- [x] Require conversation resolution
- [x] Require status checks before merging — **`lint · test · build`**(github-actions)
- [x] Require branches to be up to date before merging(strict): **ON**
- [x] Block force pushes
- [x] Block deletion
- [x] Allowed merge methods: **merge · squash** (rebase 제외)
- [x] Admin bypass: **없음**(`bypass_actors: []`) — admin 도 우회하지 않는다

### 왜 이렇게 됐나

- **approvals 0** — 승인 1 + bypass 없음이면 작성자가 자기 PR 을 merge 할 수 없어, 지휘관 PR 과
  `develop → main` 승격 PR 이 매번 남의 승인을 기다린다. 팀 크기에 맞지 않아 0 으로 뒀다.
  **막는 것(PR 필수 · force push · 삭제 · CI)은 그대로다.**
- **dismiss stale = OFF** — strict 와 함께 켜면 `Update branch` 가 push 를 일으켜 승인이 매번 날아간다.
- **strict = ON** — 각자 녹색인 PR 둘이 합쳐지면서 build 만 깨진 적이 있다(#130 ↔ #131).
  대가는 다른 PR 이 merge 될 때마다 `Update branch` 한 번 + CI 재실행(~40초).
- **bypass 없음** — 비상시에는 admin 이 ruleset 을 잠시 `disabled` 로 내린다.

### 설정으로 강제할 수 **없는** 것

`.claude/rules/git-workflow.md` 의 「이슈 PR · hotfix = squash / 승격 · 동기화 = merge commit」은
**설정으로 구분할 수 없다.** `develop` 은 이슈 PR(squash)과 동기화 PR(merge commit)을 둘 다 받고
`main` 도 승격(merge commit)과 hotfix(squash)를 둘 다 받는데, ruleset 은 branch 단위라 PR 종류를 모른다.
설정이 하는 것은 **rebase 를 끄는 것**까지이고, 나머지는 사람이 지킨다.

## 4. Merge Settings

**2026-09-18 적용 완료**(#118). 지금 값이다.

- [x] Allow squash merging: **ON** — 이슈 PR · hotfix
- [x] Merge commits: **ON** — `develop → main` 승격 · `main → develop` 동기화에 필요하다
- [x] Rebase merging: **OFF**
- [ ] Automatically delete head branches: **OFF — 켜지 않는다**

### `Automatically delete head branches` 를 켜지 않는 이유

이 팀은 **승격 PR 의 head 가 `develop`, 동기화 PR 의 head 가 `main`** 이다. 켜면 그 PR 을 merge 한 뒤
보호 대상 branch 를 지우러 갈 수 있다. ruleset 의 `deletion` 규칙이 막아 줄 것으로 보이지만
**그 상호작용은 확인하지 않았다(`미검증`)** — 틀리면 `develop` 이 사라진다.
이슈 PR 은 이미 `gh pr merge --delete-branch` 로 지우고 있어 켜서 얻는 것도 없다.

## 5. Claude Code 확인

각 팀원이 repo root에서 Claude Code를 실행한 뒤 확인:

```text
/memory
/skills
/agents
/permissions
/doctor
```

다음이 보여야 한다.

- root `CLAUDE.md`
- `.claude/rules/*`
- project skills
- project agents
- project permissions

## 6. 팀 합의가 필요한 5개

배포 시작 전에 이것만은 확정한다.

1. `main` 직접 push 금지 여부
2. 최소 reviewer 수
3. PR merge 담당자
4. 배포 담당자
5. 장애 발생 시 rollback/긴급 수정 담당자
