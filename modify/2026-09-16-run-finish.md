# 2026-09-16 · 러닝 종료 2단계 처리 · 결과 실데이터 (#85)

D6 · D7 · D13 을 구현하면서 `docs/05-policy.md` · `docs/06-data.md` 와 갈라진 것들.
`docs/01~07` 은 고치지 않았다(#78 「변경 규칙」 4).

PR #99 · squash `d9a2f78`.

## 1. 「개인 최고 기록」이 저장되는 엔티티가 아니라 계산값이 됐다

- **문서**: `docs/06-data.md:38-41` — 「개인 최고 기록」을 독립 엔티티로 두고 최장 거리 · 최고 페이스 ·
  최대 운동 시간을 항목으로 나열한다. 「**세션 목록과 별개로 갱신·보관된다(F6)**」 · 「갱신은 F6 이 하고
  표시는 F7 이 하며」. 탈퇴 삭제 범위(`:58`)에도 「개인 최고 기록」 행이 따로 적혀 있다.
- **디자인 · 구현**: **#78 D6 = B(saved 세션에서 파생)** 확정에 따라 `personal_bests` 테이블을 만들지
  않았다. `src/server/personalBest.ts` 가 `run_sessions WHERE save_state = 'saved'` 에서 그때그때
  계산한다. 물리 migration 없음.
- **고쳐야 할 곳**: `docs/06-data.md` 「개인 최고 기록」 엔티티를 `docs/06-data.md:46` 의 「개인 누적 거리」
  처럼 **계산값**으로 표기. `:58` 탈퇴 삭제 범위에서 「개인 최고 기록」 행 삭제(세션이 지워지면 자동으로
  사라진다).

## 2. 「랭킹 집계」도 계산값이 됐다

- **문서**: `docs/06-data.md:43-44` — 「랭킹 집계」 엔티티에 누적 탄천 인정 거리 · 최초 달성 시각을 둔다.
  `:58` 탈퇴 삭제 범위에도 별도 행으로 있다.
- **디자인 · 구현**: 같은 이유(D6 = B)로 `ranking_aggregates` 를 만들지 않았다. `src/server/ranking/`
  이 saved 세션에서 집계한다.
- **고쳐야 할 곳**: 위와 같다.

## 3. 「최초 달성 시각」은 이름과 달리 **가장 최근** 시각이다

가장 오해하기 쉬운 지점이라 따로 적는다.

- **문서**: `docs/06-data.md:44` — 「최초 달성 시각 — 같은 누적 거리라면 그 거리를 **먼저 달성한**
  사용자가 상위 · P5」. 예시값 `2026-09-11 07:41:22`. 이름과 설명 모두 **가장 오래된 시각**을 가리킨다.
- **디자인 · 구현**: D6 이 이 값을 **「양(+) 기여 saved 세션들의 `max(finished_at)`」** 으로 확정했다 —
  `max(finished_at) filter (where tancheon_distance_m > 0)`. 즉 **가장 최근**이다.
  - 왜 그래야 하나 — 파생값이라 「먼저 달성한 시각」을 보존하려면 누적 거리의 이력을 되짚어야 하는데,
    그 이력은 어디에도 없다. 대신 `max` 를 쓰면 **누적 거리가 같은 두 사람 중 그 거리에 더 오래전에
    도달해 그 뒤로 더 달리지 않은 쪽이 위**가 되어, 「먼저 달성한 쪽이 상위」라는 P5 의 의도와 같은
    방향으로 정렬된다.
  - `tancheon_distance_m = 0` 인 세션은 이 값을 **바꾸지 않는다**(D6 의 firstReachedAt invariant).
    단순 `max(finished_at)` 을 쓰면 안 되는 이유다.
- **고쳐야 할 곳**: `docs/06-data.md:44` 의 항목 이름과 설명. 이름을 바꾸거나(예: 「최종 기여 시각」),
  「먼저 달성한」 문구를 D6 정의로 교체한다. 코드에서는 `firstReachedAt` 이름을 그대로 쓰고 있어
  `src/server/ranking/index.ts` 주석에 같은 경고를 남겼다.

## 4. 랭킹 갱신이 「순차 처리」가 아니라 결정적 재계산 + 불변 스냅샷이다

- **문서**: `docs/05-policy.md:21` P8 — 「서버는 세션 종료 시각(타임스탬프) **순서대로 순차 처리하여**
  순위를 갱신해야 한다」. `docs/06-data.md:52` 도 「랭킹 갱신은 세션 종료 타임스탬프 순서대로 순차
  처리한다」.
- **디자인 · 구현**: **#78 D7** 이 확정한 대로, 순차 처리 대신 **authoritative `finished_at` 기반
  deterministic live ranking + immutable `rank_snapshot`** 이다. 정렬은
  `cumulativeDistance DESC → firstReachedAt ASC`, 둘 다 같으면 tie, competition ranking(`1,2,2,4`).
  `rank_snapshot` 은 tx2 시점 값으로 고정되고 이후 live ranking 이 바뀌어도 소급 수정하지 않는다.
  - 왜 — DB lock 은 상호배제만 주고 `finished_at` 순서를 보장하지 않는다. 오프라인이었다가 늦게
    도착한 **earlier finish** 가 있을 수 있어서 「도착 순서 = 종료 순서」가 성립하지 않는다.
- **고쳐야 할 곳**: `docs/05-policy.md:21` P8 의 「순차 처리」 문구, `docs/06-data.md:52` 의 같은 문장.

## 5. 종료 타임스탬프가 「버튼 누른 시각」이 아니라 clamp 된 값이다

- **문서**: `docs/05-policy.md:31` — 「이 전이는 **종료 버튼을 누른 시점**에 일어나며」. `docs/06-data.md`
  의 종료 타임스탬프도 같은 정의다.
- **디자인 · 구현**: **#78 D13** 대로
  `finished_at = clamp(clientFinishedAt, lowerBound, upperBound)` 이다.
  `lowerBound = max(session.started_at, 최종 target 에 포함되는 모든 accepted measured point 의
  max(recorded_at))` · `upperBound = finish_received_at + FUTURE_CLOCK_TOLERANCE_MS`(60초 · D11).
  `duration_sec = finished_at - started_at` 이고 `finish_received_at` 은 validation/audit 전용이다.
  - **상태 전이 자체는 문서 그대로**다 — 버튼을 누르면 `finished` 가 되고 저장 성공 여부와 무관하다.
    바뀐 것은 그 전이에 **기록되는 시각**뿐이다.
  - 왜 — 기기 시계를 그대로 믿으면 마지막 GPS 점보다 이른 종료 시각이나 먼 미래 시각이 들어와
    `duration` 과 P8 순서가 왜곡된다.
- **고쳐야 할 곳**: `docs/05-policy.md:31` 과 `docs/06-data.md` 의 종료 타임스탬프 정의에 clamp 범위를
  덧붙인다.

## 6. 문서가 유지된 것 (오해 방지용으로 적어 둔다)

D6 = B 로 바뀌었어도 **세션에 그대로 저장되는 값**이 둘 있다. 파생으로 바꾸면 안 되는 것들이다.

- `docs/06-data.md:29` **결과 화면에 표시한 개인 순위** → `rank_snapshot` · `rank_snapshot_kind` 로
  세션에 저장한다. D7 이 immutable 로 못박았다 — 나중에 순위가 바뀌어도 그때 보여 준 값이 남아야 한다.
- `docs/06-data.md:30` **개인 최고 기록 갱신 여부** → `pb_flags` 로 세션에 저장한다. 「이번 러닝으로
  무엇이 갱신됐는가」는 그 시점에만 판정할 수 있어서 파생이 불가능하다. PB 의 **값**은 파생이고
  **갱신 여부**는 저장이다.
- `docs/05-policy.md:27` P14(오프라인 · 종료 처리 실패)는 **그대로 지켰다** — `save_state` 가
  `saved` 가 되기 전까지 그 세션은 기록 탭 · 랭킹에 나타나지 않고, 결과 화면이 오류와 「다시 시도」를
  보인다.
