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

`/` 로 들어가면 서버가 상태를 보고 보낸다 — 로그아웃 → `/login` · 가입 중 → `/signup/consent` 또는 `/signup/nickname` · 진행 중 러닝 → `/running` · 그 외 → `/home`.

## 명령

| 명령 | 하는 일 | 무엇을 보장하나 |
| --- | --- | --- |
| `npm install` | 의존성 설치 | — |
| `npm run dev` | 개발 서버 (Turbopack, HMR) | 눈으로 보는 확인 |
| `npm run build` | 프로덕션 빌드 | **TypeScript 타입 검사 포함**. 타입 오류는 여기서 잡힌다 |
| `npm run start` | 빌드 결과 실행 | `build` 를 먼저 돌려야 한다 |
| `npm run lint` | ESLint (`eslint-config-next`) | 출력이 없으면 위반 0 |
| `npm test` | Vitest (`vitest run`) | **순수 함수만** 돈다. 화면 · DB · 네트워크는 대상이 아니다 |
| `npm run db:generate` | schema 변경 → migration SQL 생성 | DB 에 접속하지 않는다 |
| `npm run db:migrate` | migration 을 DB 에 적용 | **direct(unpooled) 접속**이 필요하다 — 아래 「스키마 적용」 |

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

**migration 은 direct(unpooled) 접속으로만 돈다**(#78 D3-A — 앱 runtime 은 pooled, migration 은 direct).

- 로컬 Docker 는 pooler 가 없으므로 `DATABASE_URL` 하나면 된다. 신경 쓸 것이 없다.
- **Neon 은 다르다.** Vercel 통합이 `DATABASE_URL`(pooled · 호스트에 `-pooler`)과
  `DATABASE_URL_UNPOOLED`(direct) 둘을 함께 준다. `drizzle.config.ts` 가 **`DATABASE_URL_UNPOOLED` 를
  먼저 집고**, 없으면 `DATABASE_URL` 로 넘어간다.
- pooled 밖에 없으면 **오류로 멈춘다.** pooled(PgBouncer transaction mode)는 세션 수준 기능을
  지원하지 않아 DDL 이 실패하거나 조용히 이상하게 돌 수 있는데, migration 이 반쯤 적용된 상태가
  실패보다 훨씬 비싸다. 멈추면 `DATABASE_URL_UNPOOLED` 를 채운다.

### migration 정책

- schema(`src/server/db/schema.ts`)를 고친 사람이 `npm run db:generate` 로 SQL 을 만들고 **그대로 커밋**한다.
- **생성된 SQL 을 손으로 고치지 않는다. forward-only** — 이미 적용된 migration 을 되돌려 쓰지 않고 새 migration 을 쌓는다.
- **앱 실행 · 서버 시작 · 요청 처리 · `npm run build` 는 migration 을 돌리지 않는다.** 적용은 `npm run db:migrate` 뿐이다.
- local 은 각자, integration · production 은 담당 역할이 배포 흐름에서 1회 적용한다(#78 D3-A).

### production 을 바꾸기 전 — backup / rollback

**여기는 local 이 아니라 production 이야기다.** 로컬 Docker 는 컨테이너를 지우고 다시 만들면
끝이라 이 절이 필요 없다.

**`forward-only` 라서 되돌리는 수단이 migration 에는 없다.** 위 정책대로 이미 적용된 migration 을
되돌려 쓰지 않으므로, 잘못 적용했을 때 기댈 곳은 **Neon 의 복구**뿐이다. 그래서 적용 전에
「어디로 되돌릴지」를 먼저 정해 둔다.

**그런데 자동 history window 가 6시간뿐이다**(production `little-morning-18741941` · Free plan ·
2026-09-17 확인). migration 을 적용하고 promote 한 뒤 문제를 발견하기까지 6시간을 넘기는 것은
드물지 않다. **자동 window 에 기대면 안 된다 — 적용 직전에 snapshot 을 직접 만든다.**

#### 브랜치 보호는 켤 수 없다 — Free plan 제약 (#153)

**Neon 의 Branch protection 은 유료 플랜 전용이다** — Launch 2개 · Scale 5개이고 **Free plan 은
미지원**이다(Neon 공식 문서 · 2026-09-18 확인). production `little-morning-18741941` 은 Free plan 이라
`main` 상세에 `Protect` 가 아예 없다. **화면을 못 찾은 것이 아니라 그 기능이 없다.**

그래서 콘솔에서 `main` 을 지우거나 되돌리는 것을 **막아 주는 장치가 없다.** 대신 사람이 지킨다.

- **production 프로젝트를 만질 수 있는 사람을 늘리지 않는다.**
- **콘솔을 연 순간 아래 1번(어느 프로젝트인지)을 먼저 확인한다.** integration 과 헷갈리면 그 뒤가 전부 무의미하다.
- **`Delete` · `Reset from parent` · `Restore` 는 아래 절차를 밟을 때만 누른다.**
- **SQL Editor 는 `Read-only` 를 켠 채로 연다**(#89). 쓰기가 필요한 단계만 잠시 끄고, **integration 에서만** 한다.

integration `summer-bonus-83521166` 은 **보호 대상이 아니다.** 같은 plan 제약을 받기도 하지만,
애초에 실패 주입 DDL 을 의도적으로 돌리는 곳이라 보호가 목적과 어긋난다. 여기 데이터는 잃어도 되고,
잃으면 빈 DB 에 스키마만 다시 적용한다.

보호가 없다는 것은 **자식 브랜치에도 영향을 준다** — 보호된 브랜치에서 만든 자식은 role 비밀번호가
자동으로 재생성되는데(Neon 공식 문서), 보호가 없으면 그 재생성이 없어 부모의 자격증명을 그대로
물려받는다. 실제로 production `main` 아래에 자동 생성된 preview 브랜치가 남아 있다(#180).

#### 적용 전 (promote 전 · 1회)

1. **어느 프로젝트인지 확인한다.** production 은 Neon `little-morning-18741941`,
   integration 은 `summer-bonus-83521166` 이다(#112). 둘을 헷갈리면 이 절차 전체가 무의미하다.
2. **적용 직전 상태를 적어 둔다** — 지금 시각(**타임존 포함**. Neon 콘솔은 `Asia/Seoul, GMT+09:00`
   으로 보여 준다)과 아래 값.

   ```sql
   -- 적용 전에 세어 둔다. 복구가 제 시점으로 됐는지 나중에 이 값으로 판정한다.
   SELECT count(*) FROM drizzle.__drizzle_migrations;
   ```

   2026-09-17 기준 production · integration 모두 **4**(`0000`~`0003`)다.
3. **snapshot 을 만든다. 이것이 실질적인 backup 이다.**
   Neon 콘솔 → 해당 프로젝트 → `Backup & Restore` → `Or restore from a snapshot` → **`Create`**.
   - 자동 `Restore from history` 는 **6시간**만 거슬러 갈 수 있다. 그 안에 알아채지 못하면 끝이다.
   - snapshot 스케줄(자동 생성)은 유료다(`Upgrade for schedules`). **지금은 사람이 직접 만든다.**
   - **snapshot 을 만들지 않았으면 migration 을 적용하지 않는다.**
4. `npm run db:migrate` 를 **direct(unpooled) URL 로 1회** 실행한다(위 「스키마 적용」).
   **실패하면 promote 하지 않는다**(#78 D3-A).

#### 되돌려야 할 때 — 세 경우를 구분한다

무엇이 깨졌는지에 따라 손대는 곳이 다르다. **DB 복구는 마지막 수단이다** — 되돌리는 순간
그 시점 이후에 들어온 실제 사용자 데이터가 사라진다.

| 무엇이 잘못됐나 | 무엇을 되돌리나 | 데이터 손실 |
| --- | --- | --- |
| 배포한 앱이 잘못 동작한다. **스키마는 멀쩡하다** | **Vercel 만** 이전 배포로 되돌린다. DB 는 건드리지 않는다 | 없음 |
| migration 이 반쯤 적용돼 스키마가 어중간하다 | **적용 전에 만든 snapshot** 으로 복구한다 | snapshot 이후 쓰기 전부 |
| 스키마는 맞는데 새 코드가 **데이터를 잘못 썼다** | 먼저 Vercel 을 되돌려 출혈을 멈추고, 그다음 판단한다 | 복구하면 그 시점 이후 전부 |

**대부분은 첫 줄이다.** 앱 문제를 DB 복구로 풀지 않는다.

#### 복구가 정말 필요하면

1. **먼저 Vercel 을 이전 배포로 되돌려 쓰기를 멈춘다.** 복구하는 동안에도 새 요청이 계속
   들어오면 복구 시점이 의미를 잃는다.
2. Neon 콘솔 → 해당 프로젝트 → `Backup & Restore` 에서 복구한다.
   - **적용 전에 만든 snapshot 이 우선**이다(`Or restore from a snapshot`). 6시간이 지났어도 쓸 수 있다.
   - snapshot 이 없고 **6시간 안**이라면 `Restore from history` 로 적용 직전 시각을 고른다.
   - **둘 다 없으면 되돌릴 수 없다.** 그래서 적용 전 snapshot 이 선택이 아니라 전제다.
3. 복구 후 `SELECT count(*) FROM drizzle.__drizzle_migrations;` 가 **적용 전에 적어 둔 값과 같은지**
   확인한다. 다르면 복구 시점이 틀린 것이다.
4. 저장소의 `drizzle/` 은 그대로 둔다. **되돌린 migration 파일을 지우지 않는다** — 원인을 고친
   새 migration 을 그 위에 쌓는다(forward-only).
5. **무엇을 언제 어느 시점으로 되돌렸는지 #112 에 남긴다.** 값은 적지 않고 사실만 적는다.

#### 하지 않는 것

- production 데이터를 integration 에 복제하지 않는다(#112 · SP3). 재현이 필요하면 스키마만 맞춘
  빈 DB 에 직접 만든 데이터를 쓴다.
- 접속 문자열 · 복구 링크를 Issue · PR · 댓글 · 채팅에 붙이지 않는다. **「설정됨 / 미설정」까지만** 적는다.
- 복구를 「일단 해 보는」 수단으로 쓰지 않는다. 위 표에서 어느 줄인지 먼저 정한다.

## PR 전에 반드시

```bash
npm run lint
npm run build
npm test      # src/domain 을 건드렸으면
```

lint · build 는 통과해야 한다. `build` 가 타입 검사를 겸하므로 별도 `typecheck` 명령은 없다.

## `npm test` 가 덮는 범위

`npm test` 는 **`src/**/*.test.ts`** 를 실행한다(`vitest.config.mts`). 대상은 경로가 아니라 성격으로
정해진다 — 거리 · Zone · 페이스 계산(`src/domain/measure`), 업로드 ACK 규칙(`src/server/runs/ack.ts`)
처럼 **화면 · DB · 네트워크 없이 값만으로 판정할 수 있는 순수 함수**다.

`import "server-only"` 가 붙은 모듈은 Next 밖에서 import 하는 순간 던지므로 테스트할 수 없다.
검증하고 싶은 규칙이 있으면 그 규칙만 순수 모듈로 떼어 낸다(`ack.ts` 가 그 예다).

**화면에는 여전히 테스트 러너가 없다.** `src/app` 의 검증은 lint · build · 브라우저 확인 세 가지뿐이고,
DB 를 실제로 때리는 경로(route handler · migration 적용)도 자동 테스트가 아니라 수동 확인 대상이다.

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

## MVP Gate 검증에 쓰는 것 (#89)

전체 절차 · 판정은 [modify/2026-09-17-mvp-backend-gate.md](../modify/2026-09-17-mvp-backend-gate.md). 여기는 명령만 모은다.

```bash
# 미인증 접근이 막히는지 — cookie 가 없으면 getViewer() 가 DB 를 보지 않는다
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
  https://tanchunrun-git-develop-wol20670s-projects.vercel.app/records      # 307 → /login

# 빌드 산출물에 mock 이 섞이지 않았는지 — npm run build 뒤에
grep -rlE 'MOCK_[A-Z]|/mock\.(ts|js)|mockData' .next/server .next/static | wc -l   # 0
```

- **DB 확인은 Neon 콘솔 SQL Editor 에서 `Read-only` 를 켠 채로** 한다. 실패 B 의 trigger 처럼 쓰기가 필요한 단계만 잠시 끄고, **integration 에서만** 한다.
- API 를 직접 부를 때 tracker token 은 IndexedDB 에만 있다. **콘솔에 찍거나 어디에 붙이지 않는다.**

## 주의

- `npm run dev` 를 두 개 띄우면 두 번째가 "Another next dev server is already running" 으로 죽는다. 이미 떠 있는 것을 쓰거나 먼저 끈다.
- `next.config.ts` 의 `agentRules: false` 는 `next dev` 가 루트 `CLAUDE.md` 를 고치는 동작을 막는다. 지우지 않는다.
