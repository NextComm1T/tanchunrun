# Project Commands

이 저장소에서 실제로 쓰는 명령 전부다. `.claude/rules/testing.md` 가 이 문서를 가리킨다.

## 처음 받았을 때

```bash
git clone https://github.com/NextComm1T/tanchunrun.git
cd tanchunrun
npm install
npm run dev
```

→ http://localhost:3000 (3000 이 쓰이는 중이면 Next 가 3001 등으로 올리고 터미널에 주소를 찍는다)

`/` 로 들어가면 `/login` 으로 보낸다. 아직 인증이 없어 항상 로그아웃으로 보기 때문이다.

## 명령

| 명령 | 하는 일 | 무엇을 보장하나 |
| --- | --- | --- |
| `npm install` | 의존성 설치 | — |
| `npm run dev` | 개발 서버 (Turbopack, HMR) | 눈으로 보는 확인 |
| `npm run build` | 프로덕션 빌드 | **TypeScript 타입 검사 포함**. 타입 오류는 여기서 잡힌다 |
| `npm run start` | 빌드 결과 실행 | `build` 를 먼저 돌려야 한다 |
| `npm run lint` | ESLint (`eslint-config-next`) | 출력이 없으면 위반 0 |
| `npm test` | Vitest (`vitest run`) | **`src/domain` 의 순수 함수만** 돈다. 화면은 대상이 아니다 |

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
