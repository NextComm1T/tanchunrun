# Architecture

화면을 만들기 전에 이 문서를 읽는다. **git 흐름(브랜치·커밋·PR·리뷰·머지)은 여기 없다 — `CONTRIBUTING.md` 를 본다.**

- 누가 어느 화면을 맡는지: [SCREEN_ASSIGNMENTS.md](./SCREEN_ASSIGNMENTS.md)
- 실행·검증 명령: [PROJECT_COMMANDS.md](./PROJECT_COMMANDS.md)

## 기술 스택

화면 — Next.js 16 (App Router · Turbopack) · React 19 · TypeScript · Tailwind CSS v4.

서버 — PostgreSQL 17 · `drizzle-orm`(`pg` driver) · `drizzle-kit` · `openid-client`(OIDC).

**추가하려면 먼저 팀에 말한다** — `package.json` 은 전원이 공유하는 파일이다. 스택은 #78 의 결정
ledger(D2 · D3-A)가 정본이고, 버전은 `~` 로 patch line 에 고정돼 있다. minor · major 를 올리는 것도
결정을 바꾸는 일이라 임의로 하지 않는다.

## 폴더 구조

```
src/
├─ app/                    화면 = route
│  ├─ layout.tsx           모든 화면 공통. 화면별 UI 를 넣지 않는다
│  ├─ globals.css          디자인 토큰. 건드리기 전에 팀에 말한다
│  ├─ page.tsx             /  → 첫 화면 분기 자리
│  ├─ login/               /login
│  │  ├─ page.tsx
│  │  ├─ LoginHero.tsx         ← 이 화면에서만 쓰는 조각은 같은 폴더에
│  │  └─ SocialLoginButtons.tsx
│  └─ api/auth/            OAuth route 4개 (#79). 화면이 아니다
│     ├─ google/start/route.ts · google/callback/route.ts
│     └─ kakao/start/route.ts  · kakao/callback/route.ts
├─ components/shared/      여러 화면이 쓰는 것만
│  ├─ AppShell.tsx
│  ├─ Header.tsx
│  ├─ BackButton.tsx
│  ├─ BottomNav.tsx        홈 3개 탭 하단 탭바 (#34)
│  ├─ NaverTancheonMap.tsx 실제 위경도 지도 (#84)
│  └─ TancheonMap.tsx      일러스트 지도 (#33) — **전환 중. #86 이 지운다**
├─ client/                 브라우저에서만 도는 공용 모듈
│  ├─ naverMaps.ts         NAVER Maps SDK 로더 (#84)
│  └─ tracker.ts           tracker record IndexedDB 저장 (#81)
├─ domain/                 순수 계산 (#82)
│  └─ measure/             거리 · Zone · 페이스
└─ server/                 서버에서만 도는 코드
   ├─ db/                  schema.ts · client.ts (#79)
   ├─ auth/                config · providers · session · identity · handlers · actions (#79)
   ├─ account/             동의 · 닉네임 (#80)
   └─ runs/                러닝 세션 시작 · 복원 (#81)
```

**규칙 하나로 줄이면**: 그 화면에서만 쓰면 화면 폴더 안에, 두 화면 이상이 쓰면 `components/shared/`.

한 화면에서만 쓰는 조각을 `shared/` 에 올리지 않는다. 지금은 정리돼 보여도 나중에 아무도 못 지운다.

## `src/server` · `src/domain` 경계 (D12)

| 폴더 | 무엇 | 규칙 |
| --- | --- | --- |
| `src/domain` | 프레임워크와 무관한 순수 TS. 계산 · 규칙 | React · Next · DB · env 를 import 하지 않는다. `npm test` 대상은 여기뿐이다 |
| `src/server` | 서버에서만 도는 코드. DB · 인증 · secret | 브라우저로 새어 나가면 안 된다 |
| `src/client` | 브라우저에서만 도는 공용 모듈. IndexedDB · 외부 SDK | 여러 화면이 쓰는 것만. 한 화면 것은 화면 폴더에 |

**import 방향은 한쪽뿐이다.**

```
server  →  domain     허용
domain  →  server     금지
```

`domain` 이 `server` 를 부르기 시작하면 순수 TS 라는 전제가 깨지고 테스트할 수 없게 된다.

`src/server` 아래 모듈은 **예외 없이 `import "server-only";` 로 시작한다.** 클라이언트 컴포넌트가
실수로 가져다 쓰면 빌드가 거기서 깨진다. 유일한 예외는 `"use server"` 가 붙은 server action
파일인데, 그건 Next 가 이미 클라이언트 번들에서 빼내기 때문이다.

`server-only` 는 **설치하지 않는다.** Next 가 내부적으로 처리하므로 package 가 필요 없다.

`drizzle-kit` 은 Next 밖에서 도는 CLI 라 그 처리를 모른다. 그래서 `schema.ts` 를 읽다가
`Cannot find module 'server-only'` 로 죽는데, `drizzle.config.ts` 가 **그 설정 파일 안에서만**
resolver 를 감싸 해결해 둔다. Next 는 이 설정 파일을 읽지 않으므로 앱 쪽 처리는 그대로다.

## 공용 컴포넌트

### `AppShell`

모든 화면의 가장 바깥 틀. 모바일 컬럼 폭 · safe-area · 세로 스크롤을 담당한다.

```tsx
<AppShell
  header={<Header title="설정" showBack />}  // 슬롯. 없으면 헤더 없는 화면
  bottom={<BottomNav />}                      // 슬롯. 없으면 탭바 없는 화면
  padded={false}                              // 기본 true. 히어로·지도처럼 폭을 꽉 채울 때만 false
>
  {children}
</AppShell>
```

`<main>` 이 flex 컨테이너라서 `mt-auto` 로 블록을 화면 바닥에 붙일 수 있다.

### `Header`

```tsx
<Header
  title="기록 상세"        // 없으면 타이틀 없는 헤더
  showBack                 // 없으면 뒤로가기 없는 헤더
  backHref="/records"      // 지정하면 history 대신 이 경로로
  right={<GearButton />}   // 우측 액션 슬롯
/>
```

타이틀은 **왼쪽 정렬**이다(디자인 확인 완료, 가운데 아님). 화면 이름이나 조건을 `Header` 안에 하드코딩하지 않는다 — 전부 props 로 넘긴다.

### `BackButton`

`Header` 가 알아서 쓴다. 직접 쓸 일은 거의 없다. `router.back()` 을 쓰고, `href` 를 주면 그쪽으로 이동한다. 시각 크기는 40×40 이지만 터치 영역은 48×48 이다(`07-screens.md:15`).

### `BottomNav`

홈 3개 탭 — 달리기(`/home`) · 랭킹(`/ranking`) · 기록(`/records`) — 이 공유하는 하단 탭바(#34). props 가 없다.

```tsx
import { BottomNav } from "@/components/shared/BottomNav";

<AppShell bottom={<BottomNav />}>{children}</AppShell>
```

- 활성 탭은 `usePathname` 으로 판단한다. 하위 경로(`/records/[sessionId]`)에서도 그 탭이 활성이다.
- 탭바가 없어야 하는 화면(로그인 · 가입 · 러닝 진행 · 결과 · 기록 상세 · 설정 하위, 홈의 카운트다운 중)은 `bottom` 슬롯을 비운다. 컴포넌트 안에서 경로를 분기하지 않는다.
- 설정은 탭이 아니다 — 각 탭 상단의 기어로 들어간다(`modify/2026-09-14.md` 1번).
- 달리기 탭이 `/` 가 아니라 `/home` 인 이유는 `modify/2026-09-15-bottomnav.md`.

### `NaverTancheonMap` (#84)

실제 위경도를 그리는 공용 지도. **새 화면은 이것을 쓴다.**

```tsx
import { NaverTancheonMap, type NaverTancheonMapHandle } from "@/components/shared/NaverTancheonMap";
import { TANCHEON_ZONE } from "@/domain/measure";

// 홈 달리기 탭 — 경로 없이 내 위치만
<NaverTancheonMap ref={mapRef} marker={{ lat, lng, kind: "current" }} zone={TANCHEON_ZONE} />

// 러닝 진행 — 지금까지의 경로 + 현재 위치
<NaverTancheonMap route={routePoints} marker={{ lat, lng, kind: gpsLost ? "gps-lost" : "current" }} zone={TANCHEON_ZONE} />

// 결과 · 기록 상세 — 끝난 경로
<NaverTancheonMap route={routePoints} marker={{ lat, lng, kind: "finished", inZone }} zone={TANCHEON_ZONE} />
```

| props | 뜻 |
| --- | --- |
| `route?: readonly RoutePoint[]` | `measure()`(#82)가 낸 경로. `generation → rawSeq → ordinal` 정렬 전제. **generation · segment 가 바뀌는 자리는 선을 잇지 않는다**(P2) |
| `marker?: MapMarker \| null` | `{ lat, lng, kind, inZone? }`. `kind` 는 `current`(지금 위치 — 홈 · 러닝 중 같은 글리프) · `gps-lost` · `finished`. 색이 `inZone` 으로 갈리는 것은 `finished` 뿐이다 |
| `zone?: Ring` | 탄천 Ranking Zone 폴리곤. **컴포넌트가 직접 import 하지 않고 화면이 넘긴다** — 안 쓰는 화면이 185정점을 번들에 끌고 오지 않도록 |
| `label?: string` | 스크린리더가 읽을 이름. 기본 "탄천 지도" |
| `onStatusChange?` | `loading` · `ready` · `credential` · `network` |
| `onZoomChange?` | `{ zoom, canZoomIn, canZoomOut }`. 화면의 +/− 버튼 disabled 판정용 |
| `ref` | `zoomIn()` · `zoomOut()` · `recenter()`. 버튼은 화면이 그리고 이걸로 지도를 움직인다 |

- **표시 전용이다.** 거리 · Zone 판정 · 경계점 · 속도 제외는 전부 `src/domain/measure`(#82)가 한다. 이 컴포넌트에 계산을 넣지 않는다.
- `inZone` 이 바뀌는 점은 앞뒤 선이 함께 가져서 경계에서 색이 갈린다(R11). 경계점은 `measure()` 가 이미 만들어 준다.
- 속도 초과 구간(P9)은 **일반 구간과 같은 스타일**이다. `excludedFromPrevReason` 을 선 스타일에 쓰지 않는다.
- **camera follow 는 내부 동작이다**(D10) — 기본 on · 위치가 바뀌면 최대 2초에 1회 `panTo` · 사용자 pan/zoom 제스처에 off · `recenter()` 로 다시 on. **props 를 늘리지 않는다.**
- **그리지 않는 것** — 확대 · 축소 · 재중심 버튼, 범례, GPS 안내 카드 · 딤. 디자인에서 지도 바깥 요소라 각 화면이 지도 위에 그린다.
- **크기는 부모가 정한다** — `size-full` 이라 부모 상자에 높이가 있어야 한다.
- 실패하면 **지도 영역만** 안내로 바뀐다. SDK 를 못 받으면(`network`) 「다시 시도」가 있고, key · 서비스 URL 문제(`credential`)는 사용자가 할 수 있는 일이 없어 안내만 한다. 어느 쪽이든 그 화면의 나머지 기능은 계속 동작해야 한다.
- SDK 로더는 `src/client/naverMaps.ts` 다. `layout.tsx` 에 `<script>` 를 넣지 않는다. env 는 `NEXT_PUBLIC_NAVER_MAP_KEY_ID`(#78 D3-B) 하나이고 **값을 저장소에 두지 않는다.**

### `TancheonMap` — 전환 중 (지우는 것은 #86)

러닝 진행(#40) · 결과(#41) · 기록 상세(#45)가 아직 쓰는 **일러스트** 지도(#33). 홈(#42)은 #84 에서 `NaverTancheonMap` 으로 옮겼다.

**새로 쓰지 않는다.** running 은 #83, result 는 #85, 기록 상세는 #86 이 옮기고, 마지막 consumer 가 옮겨진 뒤 #86 이 이 파일과 SVG 좌표 타입을 지운다. 그때까지 **동결**이다.

좌표계는 원본 SVG 그대로 `MAP_WIDTH`×`MAP_HEIGHT`(340×220)이고, 경로 좌표도 이 좌표계의 값이다.

```tsx
import { TancheonMap, type RouteSegment } from "@/components/shared/TancheonMap";

// 러닝 진행 — 현재 위치 마커 · 확대
<TancheonMap route={segments} endMarker={gpsLost ? "gps-lost" : "running"} viewBox={zoomViewBox} />

// 결과 · 기록 상세 — 끝난 경로
<TancheonMap route={segments} />

// 홈 달리기 탭 — 경로 없이 내 위치만
<TancheonMap userPin={{ x: 155, y: 112 }} viewBox={zoomViewBox} />
```

| props | 뜻 |
| --- | --- |
| `route?: RouteSegment[]` | 연속 구간 배열(`{ x, y, inZone }[][]`). **구간과 구간 사이는 선을 잇지 않는다** — GPS 가 끊긴 자리다(P2) |
| `endMarker?: "finished" \| "running" \| "gps-lost"` | 경로 끝점 표시. 기본 `finished`(끝점이 Zone 안이면 파랑, 밖이면 회색) · `running`(현재 위치) · `gps-lost`(유실 색 + "위치 확인 중…") |
| `userPin?: { x, y }` | 경로 없이 내 위치만 찍는다(홈). `route` 와 함께 넘기면 마커가 겹친다 |
| `viewBox?: string` | 기본 `0 0 340 220`. 확대한 값은 화면이 계산해서 넘긴다 |
| `label?: string` | 스크린리더가 읽을 이름. 기본 "탄천 지도" |

- `inZone` 이 바뀌는 점은 앞뒤 선이 함께 가져서 경계에서 색이 갈린다(R11). 경계점을 계산해 넣는 것은 호출하는 쪽(mock 데이터) 몫이다.
- 속도 초과 구간(P9)을 위한 props 는 없다 — 일반 구간과 같은 스타일로 그린다.
- **그리지 않는 것** — 확대 · 축소 · 재중심 버튼, 범례, GPS 경고 카드, GPS 확인 중 딤. 디자인에서 지도 바깥 요소라 각 화면이 지도 위에 그린다. 확대 값 · 단계 계산도 화면 몫이다.
- **크기는 부모가 정한다** — `size-full` 이라 부모 상자에 높이가 있어야 한다. `preserveAspectRatio="xMidYMid slice"` 라 상자 비율에 맞춰 잘린다.
- `"use client"` 가 없는 환경 중립 컴포넌트다. 클라이언트 화면 안에서 쓰면 클라이언트로 돈다.

## 디자인 토큰

**임의 hex 를 쓰지 않는다.** 값은 전부 `탄천런.dc.html` 에서 뽑아 `globals.css` 에 토큰으로 들어가 있다. 없는 값이 필요하면 먼저 팀에 말한다.

Tailwind 유틸로 바로 쓴다 — `bg-surface` · `text-muted` · `rounded-xl` · `shadow-card`.

### 색

| 쓸 곳 | 유틸 | 값 |
| --- | --- | --- |
| 페이지 배경 | `bg-background` | `#FBF7EF` |
| 앱 컬럼 바깥 | `bg-canvas` | `#E9F1FA` |
| 카드 · 탭바 | `bg-surface` | `#FFFFFF` |
| divider · 아이콘 버튼 면 | `bg-surface-muted` | `#F1EDE2` |
| 카드 테두리 | `border-border` | `#EFE7D8` |
| 기본 글자 | `text-foreground` | `#1E2E4F` |
| 긴 본문 | `text-subtle` | `#6A7488` |
| 라벨 · 캡션 | `text-muted` | `#8B93A5` |
| 비활성 | `text-disabled` | `#B6BDC9` |
| CTA · 강조 | `bg-primary` `text-primary` | `#2F6FE8` |
| 탄천 인정 · 성공 | `text-success` `bg-success-soft` | `#3F7F31` `#E8F5DE` |
| 러닝 중단 · 탈퇴 | `bg-danger` | `#EF6A5E` |
| 오류 | `text-error` `bg-error-soft` `border-error-border` | `#C4483C` … |
| GPS 약함 · 경고 | `text-warning` `bg-warning-soft` | `#9B7419` … |
| 랭킹 1·2·3위 | `text-rank-gold` `-silver` `-bronze` | — |
| 지도 | `bg-map-base` `bg-map-water` `bg-map-park` … | — |

전체 목록은 [globals.css](../src/app/globals.css) 에 있고, 값마다 디자인 원본 줄 번호가 주석으로 달려 있다.

### 글자 크기

`text-caption`(11) · `text-label`(12) · `text-note`(13) · `text-content`(15) · `text-button`(17) · `text-title`(20) · `text-metric`(26) · `text-display`(32) · `text-hero`(34)

14·16·18px 은 Tailwind 기본 `text-sm`·`text-base`·`text-lg` 와 같은 값이라 토큰을 만들지 않았다.

### 모서리 · 그림자

`rounded-xs`(12) · `rounded-sm`(14) · `rounded-md`(16) · `rounded-lg`(18) · `rounded-xl`(20) · `rounded-2xl`(22) · `rounded-3xl`(24) · `rounded-full`(pill)

`shadow-card` · `shadow-modal` · `shadow-primary` · `shadow-button` · `shadow-raised` · `shadow-toast` · `shadow-danger`

### 간격

Tailwind 기본 스케일이 디자인 수치와 그대로 맞는다. `p-1`=4px … `p-6`=24px. 별도 토큰 없다.

### 한 번만 쓰는 값

`text-[19px]` 처럼 임의값으로 쓴다. 스케일을 늘리지 않는다.

## Server / Client Component

**기본은 Server Component 다.** `"use client"` 는 필요한 조각에만 붙인다 — `onClick` · `useState` · `useRouter` · `usePathname` 이 있을 때.

로그인 화면이 예시다. `page.tsx` 와 `LoginHero.tsx` 는 서버, 버튼만 있는 `SocialLoginButtons.tsx` 만 클라이언트다. 화면 전체를 통째로 `"use client"` 로 만들지 않는다.

## 이미지

`assets/` 의 이미지는 **옮기거나 복사하지 않는다.** static import 로 쓰면 `next/image` 가 번들하고 최적화까지 해 준다.

```tsx
import Image from "next/image";
import heroOtter from "@assets/otter-hero-wide-v2.png";

<Image src={heroOtter} alt="탄천을 달리는 탄천런 수달" priority />
```

`@assets/*` 별칭은 `tsconfig.json` 에 있다. `public/` 으로 옮기지 않는다.

## 새 화면 만들기 — 5단계

[src/app/login/](../src/app/login/) 을 열어 놓고 그대로 따라 하면 된다.

1. **디자인을 연다** — [SCREEN_ASSIGNMENTS.md](./SCREEN_ASSIGNMENTS.md) 에서 내 화면의 `탄천런.dc.html` 줄 범위를 찾는다. 브라우저로 `탄천런.dc.html` 을 직접 열면 실제 화면도 볼 수 있다.
2. **폴더를 만든다** — `src/app/<route>/page.tsx`. 조각이 필요하면 같은 폴더에.
3. **AppShell 로 감싼다** — 탭바가 필요하면 `bottom={<BottomNav />}`. 공용 `Header` 는 디자인 상단이 그 구조(sticky · 아래 테두리 · 20px 제목 · 40px 뒤로 가기)와 맞을 때만 `header={<Header ... />}` 로 쓴다. 맞지 않으면 화면 폴더 안에 로컬로 그리고, 그 이유로 `src/components/shared/*` API 를 바꾸지 않는다. 화면별 이슈에 정해져 있다.
4. **토큰으로 그린다** — 임의 hex 금지. 디자인의 인라인 style 을 Tailwind 유틸로 옮긴다.
5. **상태를 구분한다** — `07-screens.md:12` 의 불러오는 중 · 빈 상태 · 오류 · 정상은 **실제로 성립할 때만** 구현한다. 오류가 있으면 "다시 시도" 같은 다음 행동이 보여야 한다. 서버/API 요청이 없는 mock 범위에서는 실패할 요청이 없으므로 가짜 Promise · query error 로 loading/error 를 만들지 않는다. 대신 화면별 이슈의 「상태 정의」(GPS 확인 중 · 빈 목록 · 없는 session id 등)를 구분하고, 그 정의가 이 줄보다 우선한다.

그리고 `npm run lint` · `npm run build`.

## 기획 문서와 다르게 구현했다면

**기획 문서(`docs/01~07`)를 고치지 않는다.** 구현 기준은 캡처된 디자인이고, 문서는 나중에 한 번에 맞춘다.

대신 `modify/YYYY-MM-DD-<화면>.md` 를 만들어 세 줄로 적는다.

```markdown
## <무엇이 다른가>
- **문서**: (문서가 말하는 것 + 파일:줄)
- **디자인 · 구현**: (실제로 한 것 + 디자인 줄 번호)
- **고쳐야 할 곳**: (나중에 손댈 문서 위치)
```

파일명에 화면 이름을 넣는 이유는 같은 날 여러 명이 작업해도 충돌하지 않게 하기 위해서다.

예시: [modify/2026-09-14.md](../modify/2026-09-14.md)

## 인증 (#79)

카카오 · 구글 OIDC 로그인이 붙어 있다. 화면을 만들 때 알아야 할 것만 적는다.

**현재 사용자를 알고 싶을 때** — `getViewer()` 하나만 쓴다.

```tsx
import { getViewer } from "@/server/auth/session";

const viewer = await getViewer();   // { userId, accountState, nickname, provider } | null
```

- 서버에서만 부른다. **client 가 보낸 userId 를 믿지 않는다** — 서버 함수는 항상 세션에서 얻는다.
- `null` 이면 로그아웃이다. `accountState` 는 `signing_up`(닉네임 미설정) 또는 `active`.
- `hasActiveRun` 은 아직 없다. #81 이 기존 필드를 바꾸지 않고 **덧붙인다**.

**로그아웃** — `signOut()`(server action)이 현재 기기 세션 행을 지우고 쿠키를 지운다.
`{ ok: true } | { ok: false, error: "failed" }` 를 돌려주므로, **`ok` 일 때만 화면을 옮긴다.**
실패했는데 로그인 화면으로 보내면 세션이 살아 있는 채로 로그아웃한 것처럼 보인다.

**세션 수명** — 발급 후 **고정 30일**이다. 써도 연장되지 않고(rolling 없음) 30일이 지나면 재로그인이다.
기획 문서의 "로그아웃 전까지 유지" 와 다른 지점이라 `modify/2026-09-16-auth.md` 에 적어 뒀다.

**카카오와 구글은 이어지지 않는다** — 같은 사람이어도 UID 가 둘이다(P11). email 로 계정을 잇는
코드를 두지 않는다. 애초에 **이메일 · 프로필 · OAuth token 을 저장하지 않는다**(SP3).

실행에 필요한 것(로컬 PostgreSQL · `.env.local` · migration)은 [PROJECT_COMMANDS.md](./PROJECT_COMMANDS.md).

## 아직 없는 것

- **첫 화면 분기 · 가입 흐름** — `/` 는 여전히 `/login` 으로만 보낸다. 로그인 상태 · 가입 중 여부에 따른 분기와 동의 · 닉네임 저장은 #80 이 한다. `layout.tsx` · 루트 `page.tsx` 는 **공유 인프라**라 화면 브랜치에서 건드리지 않는다.
- **API · 데이터** — 인증 밖의 서버는 아직 없다. 러닝 · 랭킹 · 기록 화면은 mock 데이터로 만든다.
- **화면 테스트 러너** — `npm test`(Vitest)는 `src/domain` 만 돈다(#82). `src/app` 의 검증은 여전히 lint · build · 브라우저 확인뿐이다.
- **실지도 확인** — `NEXT_PUBLIC_NAVER_MAP_KEY_ID` 와 NAVER Console 등록이 끝나야 지도가 실제로 뜬다(#78 D3-B). 그전에는 `credential` 안내가 지도 자리에 보이는 것이 정상이다.
