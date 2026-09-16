# 2026-09-16 — background GPS: 「잠금·앱 전환 중에도 측정」 요구와 구현의 차이 (#83 · D1)

> 기획 문서(`docs/01~07`)는 고치지 않고 갈라지는 지점만 여기 쌓아 둔다. 규칙은
> [ARCHITECTURE.md](../docs/ARCHITECTURE.md) 「기획 문서와 다르게 구현했다면」.
>
> **이 파일은 기록일 뿐, 문서를 고치지 않았다.**

D1 이 **MVP platform = Web-only** 로 확정되면서(2026-09-16, #78 ledger) 기획 문서가 전제한
「화면을 꺼도 계속 측정」이 이번 MVP 에서는 성립하지 않는다. 가능한 척 구현하지 않고 차이를
여기 적는다.

---

## 1. 대상 환경이 웹이다

- **문서**: `docs/01-problem.md:78` 대상 환경 — 모바일에서 달리면서 쓰는 앱을 전제한다.
- **구현**: Next.js 웹앱 하나다(D1). native wrapper · background location plugin 을 넣지 않았고,
  특정 native 기술을 선점하지도 않았다. 필요해지면 D1 을 SUPERSEDED 하고 별도로 정한다.
- **고쳐야 할 곳**: `docs/01-problem.md:78` 에 「MVP 는 Web-only」를 명시한다.

## 2. 화면이 숨으면 측정이 멈춘다

- **문서**: `docs/04-features.md:17` F2 는 러닝 중 측정이 끊기지 않는 것을 전제하고,
  `docs/05-policy.md:31` 의 러닝 세션 상태값도 「진행 중」이 곧 측정 중임을 가정한다.
- **구현**(`src/app/running/useRunTracker.ts`): `visibilitychange → hidden` 이면 `clearWatch` 로
  watch 를 정리하고 **platform gap** 으로 전환한다. 브라우저는 백그라운드 탭에 위치를 계속 주지
  않으므로, 주는 척하면 사용자는 측정되고 있다고 믿는데 실제로는 빈 구간이 생긴다.
  - 숨어 있던 구간은 **거리 · 경로에 이어 붙이지 않는다.** 복귀 후 첫 accept 는
    `resolveSegment(…, gapPending = true)` 로 **새 segment** 에서 시작해 선이 이어지지 않는다.
  - 숨은 동안 **P3 경고를 새로 띄우지 않는다.** 사용자가 알고 한 일이라 경고할 것이 없다.
    표시 중이던 경고도 내린다.
  - 복귀 시 권한을 다시 확인한다(Permissions API 지원 시). 거부면 D10 `PERMISSION_DENIED` 경로다.
- **고쳐야 할 곳**: `docs/04-features.md:17` F2 와 `docs/05-policy.md:31` 에 「foreground 에서만
  측정한다 · 숨은 구간은 경로에서 빠진다」를 적는다.

## 3. 경과 시간만은 숨은 시간을 포함한다

- **문서**: `docs/06-data.md:22` 는 러닝 시간을 세션의 값으로 둔다.
- **구현**: 경과 시간은 서버 `started_at` 기준이라 **숨어 있던 시간도 포함한다**(#81 `RunStatusBar`).
  거리는 빠지는데 시간은 흐르므로, 오래 숨겼다 돌아오면 평균 페이스가 실제보다 느려 보인다.
  이건 버그가 아니라 D1 이 택한 절충이다 — 시간을 멈추면 어느 기기에서 열어도 같은 값이 나오는
  성질이 깨진다.
- **고쳐야 할 곳**: `docs/06-data.md:22` 에 「러닝 시간 = 서버 시작 시각 기준 · 화면이 숨은 시간 포함」
  을 적는다.

## 4. Screen Wake Lock 은 best-effort 다

- **문서**: `docs/07-screens.md:36` 러닝 진행 화면은 달리는 동안 화면이 켜져 있는 것을 전제한다.
- **구현**: foreground 러닝 중 `navigator.wakeLock.request("screen")` 을 **best-effort** 로 걸고
  visible 복귀 시 다시 건다. **실패 · 미지원 · UA 해제는 active run 을 실패시키지 않는다.**
  background GPS 보장 수단으로 쓰지 않는다 — Wake Lock 은 화면을 켜 둘 뿐이고 위치를 주는 것과
  무관하다.
- **고쳐야 할 곳**: `docs/07-screens.md:36` 에 「화면 꺼짐 방지는 best-effort, 실패해도 러닝은 계속」
  을 적는다.
