# Project Commands

이 저장소에서 실제로 쓰는 명령 전부다. `.claude/rules/testing.md` 가 이 문서를 가리킨다.

## 처음 받았을 때

```bash
git clone https://github.com/NextComm1T/tanchunrun.git
cd tanchunrun
npm install
npm run dev
```

→ http://localhost:3000

**`.env.local` 이 없으면 여기까지 오지 못한다.** 서버 전용 env 6개 중 하나라도 비어 있으면
`npm run dev` 는 시작 시점에 종료된다(`npm run start` 는 뜨지만 모든 요청이 500 이 된다).
화면만 볼 사람도 `.env.local` 이 필요하다 — 아래 「2. `.env.local`」 을 먼저 본다.

**3000 이어야 한다.** 3000 이 쓰이는 중이면 Next 가 3001 등으로 올리는데, 그러면 `APP_ORIGIN` 과
provider 에 등록된 callback 주소가 어긋나서 로그인이 실패한다. 3000 을 쓰는 프로세스를 먼저 끄고
다시 띄운다. (화면만 보고 로그인을 안 쓸 거라면 3001 이어도 상관없다 — 그래도 `.env.local` 은 있어야 뜬다.)

`/` 로 들어가면 `/login` 으로 보낸다. 로그인 상태에 따른 분기는 아직 붙지 않았다(#80).

## 명령

| 명령 | 하는 일 | 무엇을 보장하나 |
| --- | --- | --- |
| `npm install` | 의존성 설치 | — |
| `npm run dev` | 개발 서버 (Turbopack, HMR) | 눈으로 보는 확인 |
| `npm run build` | 프로덕션 빌드 | **TypeScript 타입 검사 포함**. 타입 오류는 여기서 잡힌다 |
| `npm run start` | 빌드 결과 실행 | `build` 를 먼저 돌려야 한다 |
| `npm run lint` | ESLint (`eslint-config-next`) | 출력이 없으면 위반 0 |
| `npm test` | Vitest (`vitest run`) | **`src/domain` 의 순수 함수만** 돈다. 화면은 대상이 아니다 |
| `npm run db:generate` | schema 변경 → migration SQL 생성 | DB 에 접속하지 않는다 |
| `npm run db:migrate` | migration 을 DB 에 적용 | `DATABASE_URL` 이 필요하다 |

## DB — 로그인을 쓰려면 필요하다

로컬 PostgreSQL(1) 과 스키마 적용(3) 은 **로그인 · 로그아웃을 쓸 때만** 필요하다. 화면만 볼 거라면
건너뛰어도 된다.

**`.env.local`(2) 만은 예외로, 화면만 보더라도 있어야 한다.** 없으면 `npm run dev` 가 시작 시점에
종료된다 — env 누락을 서버 시작 시 걸러 내기 때문이다(#79).

### 1. 로컬 PostgreSQL 17 (개발자마다 각자 띄운다)

공유 cloud dev DB 를 쓰지 않는다. compose 파일은 두지 않는다.

```bash
docker run --name tancheon-pg -e POSTGRES_PASSWORD=<직접 정한다> \
  -e POSTGRES_DB=tancheonrun -p 5432:5432 -d postgres:17
```

컨테이너는 한 번만 만들면 된다. 다음부터는 `docker start tancheon-pg` · `docker stop tancheon-pg`.

### 2. `.env.local`

`.env.example` 을 복사해 값을 채운다. **값은 담당자에게 승인된 비밀 공유 수단으로 받는다.**

```bash
cp .env.example .env.local
```

- `.env.local` 은 `.gitignore` 로 무시된다. `.env.example` 만 커밋된다(이름만, 값 없음).
- **값을 터미널에 찍거나 Issue · PR · 댓글 · 채팅에 붙이지 않는다.** 확인은 "설정됨 / 미설정" 까지만 한다.
- `APP_ORIGIN` 은 로컬에서 `http://localhost:3000` 고정이다.
- 어떤 값을 누가 주는지는 #78 D3-A 를 본다.
- **빈 값(`KEY=`)은 미설정과 같다.** `cp` 만 하고 두면 서버는 여전히 시작하지 않는다.
- **화면만 볼 거라면** 6개를 전부 채우되 `APP_ORIGIN` 만 `http://localhost:3000` 이면 되고 나머지
  5개는 자리표시자여도 화면은 뜬다. 로그인만 안 된다. 실제 값이 필요한 사람은 위를 따른다.

### 3. 스키마 적용

```bash
npm run db:migrate
```

빈 DB 에 한 번 돌리면 스키마가 생기고, 다시 돌려도 바뀌는 것이 없다. 이력은 `drizzle.__drizzle_migrations` 에 남는다.

### migration 정책

- schema(`src/server/db/schema.ts`)를 고친 사람이 `npm run db:generate` 로 SQL 을 만들고 **그대로 커밋**한다.
- **생성된 SQL 을 손으로 고치지 않는다. forward-only** — 이미 적용된 migration 을 되돌려 쓰지 않고 새 migration 을 쌓는다.
- **앱 실행 · 서버 시작 · 요청 처리 · `npm run build` 는 migration 을 돌리지 않는다.** 적용은 `npm run db:migrate` 뿐이다.
- local 은 각자, integration · production 은 담당 역할이 배포 흐름에서 1회 적용한다(#78 D3-A).

## PR 전에 반드시

```bash
npm run lint
npm run build
npm test      # src/domain 을 건드렸으면
```

lint · build 는 통과해야 한다. `build` 가 타입 검사를 겸하므로 별도 `typecheck` 명령은 없다.

## `npm test` 가 덮는 범위

`npm test` 는 **`src/domain/**/*.test.ts` 만** 실행한다(`vitest.config.mts`). 거리 · Zone · 페이스 같은
계산 규칙처럼 화면 없이 값만으로 판정할 수 있는 것이 대상이다.

**화면에는 여전히 테스트 러너가 없다.** `src/app` 의 검증은 lint · build · 브라우저 확인 세 가지뿐이다.

PR 에 "테스트 완료"라고 적지 않는다. 실제로 한 것만 적는다 (`CONTRIBUTING.md` 8. 금지) —
`npm test` 를 돌렸으면 그 결과를, 브라우저로 본 것은 브라우저로 봤다고 적는다.

## 확인할 때 자주 쓰는 것

```bash
# 특정 화면만 빠르게
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login

# 토큰이 빌드된 CSS 에 실제로 나왔는지
#   Tailwind 는 클래스 오타가 나도 빌드가 통과한다. 눈으로 확인해야 한다.
grep -o "bg-surface{[^}]*}" .next/static/chunks/*.css
```

## 주의

- `npm run dev` 를 두 개 띄우면 두 번째가 "Another next dev server is already running" 으로 죽는다. 이미 떠 있는 것을 쓰거나 먼저 끈다.
- `next.config.ts` 의 `agentRules: false` 는 `next dev` 가 루트 `CLAUDE.md` 를 고치는 동작을 막는다. 지우지 않는다.
