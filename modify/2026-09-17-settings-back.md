# 2026-09-17 — 설정 화면(`/settings`) · 뒤로가기가 history 대신 source tab 으로 간다 (#127)

> 이 파일은 기록일 뿐, 문서를 고치지 않았다. 폴더 규칙은 `modify/2026-09-14.md` 머리말을 따른다.
> 같은 화면의 이전 차이는 `modify/2026-09-14-settings.md` 에 있다 — 이 파일은 #127 이 더한 것만 적는다.

## 1. 설정 뒤로가기가 `router.back()` 이 아니라 기억해 둔 탭으로 `push` 한다

- **문서**: `docs/07-screens.md:29` 는 설정 화면의 이동을 「탭 이동(러닝 시작 화면 · 랭킹 화면 ·
  기록 탭)」으로만 적고 **어느 탭으로 돌아가는지**는 정하지 않는다. `modify/2026-09-14.md` 1번은
  「설정은 탭이 아니라 각 탭 상단의 기어로 들어간다」까지만 기록했고, 구현은 그 뒤 `backHref` 를
  주지 않는 공용 `Header` 로 `router.back()` 을 써 왔다(`settings/page.tsx` 주석).
- **디자인 · 구현**: 정본 `탄천런.dc.html` L1021 · L1171-1172 는 단일 state machine 이라
  `settingsReturnTab` 한 값으로 끝난다. 이 앱은 라우트가 실제 페이지라 history 에 기대면
  direct 진입 · 새 탭 · 하위 화면 왕복에서 깨진다. 그래서 기어를 누를 때 `sessionStorage` 에
  source tab 을 남기고(`returnTab.ts`), 설정 뒤로가기는 그 값으로 **`router.push`** 한다.
  - 값이 없거나 allowlist 밖이거나 저장소를 못 쓰면 전부 `/home` 이다.
  - 공용 `Header` 를 쓰지 못한다 — `backHref` 는 렌더 시점에 고정되는 정적 문자열인데 목적지가
    client 저장소를 읽어야 정해진다. `ARCHITECTURE.md` 「새 화면 만들기」 3단계대로 화면 폴더
    안에 `SettingsHeader` · `SettingsBackButton` 을 로컬로 두고 `components/shared/*` 는 바꾸지
    않았다. 레이아웃 값은 공용 `Header` 와 같다.
  - **`back()` 이 아니라 `push()` 라 history 가 쌓인다.** 설정에서 나온 뒤 브라우저 뒤로가기를
    누르면 설정으로 되돌아온다. history 의존을 버린 것이 이 이슈의 목적이라 감수한 trade-off다.
- **고쳐야 할 곳**: `docs/07-screens.md:29` 설정 화면 행의 이동에 「뒤로가기는 들어온 탭으로
  돌아가고, 알 수 없으면 러닝 시작 화면으로 간다」를 덧붙인다.

## 2. 랭킹 탭의 설정 기어가 `page.tsx` 에서 별도 client 조각으로 빠졌다

- **문서**: 해당 없음 — 문서는 컴포넌트 분리를 규정하지 않는다.
- **디자인 · 구현**: 기어를 누를 때 source tab 을 기록해야 해서 `onClick` 이 필요한데,
  `ranking/page.tsx` 는 async server component 라 핸들러를 가질 수 없다. 홈(`HomeHeader`)도
  같은 이유로 `SettingsGearLink` 를 떼어 냈다. 기록 탭은 이미 분리돼 있어 `"use client"` 만
  붙였다. `ARCHITECTURE.md` 「Server / Client Component」의 "필요한 조각에만" 을 따른 것이고,
  세 조각 모두 해당 화면 폴더 안에 둔다(공용으로 올리지 않는다).
- **고쳐야 할 곳**: 없다.
