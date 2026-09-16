import "server-only";

import { inArray } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { getLiveRanking } from "@/server/ranking";

/**
 * 랭킹 화면(F5) · 홈 「내 탄천 순위」 카드가 쓰는 조회(#87 · P5 · P8 · SP1).
 *
 * **집계는 여기서 하지 않는다.** 누적 거리 · firstReachedAt · 순위 산정은 `src/server/ranking`
 * (#85 소유)이 이미 갖고 있고, 이 모듈은 그 결과에 닉네임과 「본인 여부」를 붙여 화면이 쓸 수
 * 있는 모양으로 바꾸기만 한다. 두 화면이 같은 함수를 지나가므로 `/ranking` 본인 줄과 홈 카드가
 * 어긋날 수 없다.
 *
 * 파일이 `src/server/ranking/` **안**이 아니라 밖에 있는 이유는 그 폴더가 #85 소유라 읽기만
 * 허용되기 때문이고, 이름이 `src/server/ranking.ts` 가 아닌 이유는 그러면 폴더와 모듈 경로가
 * 겹치기 때문이다.
 *
 * **응답에 userId 를 넣지 않는다**(SP1 · SP3). 공개되는 것은 닉네임 · 인정 누적 거리 · 순위뿐이고,
 * 「나」 판정은 서버가 세션에서 얻은 userId 로 미리 끝내서 `isMe` 한 칸으로만 내보낸다.
 */

/** 랭킹 한 줄. 화면이 그리는 값만 담는다. */
export type RankingEntry = {
  rank: number;
  nickname: string;
  /** 누적 탄천 인정 거리(m). 저장은 m, 표시는 km 다. */
  distanceM: number;
  /** 본인 줄 강조(F5)에 쓴다. 목록에서 많아야 한 줄이 참이다. */
  isMe: boolean;
};

export type Ranking = {
  /** 누적 거리 내림차순 → firstReachedAt 오름차순(D7). 인원 제한이 없다(P5). */
  entries: RankingEntry[];
  /** 랭킹에 오른 전체 인원. 목록을 자르지 않으므로 `entries.length` 와 같다. */
  total: number;
};

/** 홈 달리기 탭 상단 인사 · 「내 탄천 순위」 카드(#42)가 한 번에 받는 값. */
export type HomeSummary = {
  nickname: string;
  /** 랭킹에 올라 있지 않으면 `null` — 누적 인정 거리가 0 인 사용자다(P5). */
  rank: number | null;
  total: number;
  /** 본인의 누적 탄천 인정 거리(m). 랭킹에 없으면 0 이다. */
  tancheonDistanceM: number;
};

/**
 * 지금 이 순간의 전체 랭킹.
 *
 * 순위 숫자 · 정렬 · 0 제외 · 동점 처리는 전부 `getLiveRanking()` 이 끝낸 것을 그대로 쓴다 —
 * 여기서 다시 정렬하거나 순위를 매기면 결과 화면의 스냅샷(#85)과 규칙이 갈라진다.
 */
export async function getRanking(viewerUserId: string): Promise<Ranking> {
  const ranked = await getLiveRanking();
  if (ranked.length === 0) return { entries: [], total: 0 };

  const nicknames = await findNicknames(ranked.map((user) => user.userId));

  const entries = ranked.flatMap<RankingEntry>((user) => {
    const nickname = nicknames.get(user.userId);

    /*
      닉네임이 없는 사용자는 목록에 올리지 않는다. 가입을 마쳐야(`account_state = 'active'`)
      러닝을 시작할 수 있고(`runs/actions.ts:61`) 그 조건이 닉네임 저장과 같은 갱신이라
      실제로는 생기지 않는다 — 생겼다면 데이터 이상이므로 이름 없는 줄을 그리는 대신 뺀다.
      **순위 번호는 다시 매기지 않는다**: 그 사람의 누적 거리는 이미 다른 사람들의 순위에
      반영돼 있어서, 여기서 번호를 당기면 남의 순위가 실제와 달라진다.
    */
    if (nickname === undefined) return [];

    return [
      {
        rank: user.rank,
        nickname,
        distanceM: user.cumulativeDistanceM,
        isMe: user.userId === viewerUserId,
      },
    ];
  });

  return { entries, total: entries.length };
}

/**
 * 홈 요약. `getRanking()` 과 **같은 조회**를 지나므로 홈 카드의 순위 · 누적이 `/ranking` 의
 * 본인 줄과 같은 값이다.
 *
 * 닉네임은 랭킹 결과가 아니라 viewer 에서 받는다 — 누적 0 이라 목록에 없는 사용자도 인사는
 * 받아야 한다. `getViewer()` 가 요청마다 `users.nickname` 을 읽으므로 닉네임을 바꾸면 바로
 * 반영되고, UID 는 그대로라 순위 · 누적은 움직이지 않는다.
 */
export async function getHomeSummary(viewer: {
  userId: string;
  nickname: string;
}): Promise<HomeSummary> {
  const { entries, total } = await getRanking(viewer.userId);
  const mine = entries.find((entry) => entry.isMe);

  return {
    nickname: viewer.nickname,
    rank: mine?.rank ?? null,
    total,
    tancheonDistanceM: mine?.distanceM ?? 0,
  };
}

/**
 * UID → 닉네임. 랭킹 집계가 UID 만 내놓으므로 이름은 여기서 찾는다(SP3 — 집계 쪽은 사용자
 * 테이블을 알 필요가 없다).
 *
 * 탈퇴한 사용자는 이 조회에 걸릴 수 없다 — `run_sessions.user_id` 가 `users` 를 CASCADE 로
 * 참조해서(#88 · P13) 계정이 지워지면 세션도 함께 사라지고 집계에서 이미 빠진다.
 */
async function findNicknames(userIds: string[]): Promise<Map<string, string>> {
  const rows = await getDb()
    .select({ id: users.id, nickname: users.nickname })
    .from(users)
    .where(inArray(users.id, userIds));

  return new Map(
    rows.flatMap<[string, string]>((row) =>
      row.nickname === null ? [] : [[row.id, row.nickname]],
    ),
  );
}
