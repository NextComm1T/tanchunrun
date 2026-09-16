import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * tracker token(#81 · D14).
 *
 * **auth session 과는 완전히 별개다.** auth session 은 "누구인가" 를, tracker token 은
 * "지금 이 세션에 측정을 올릴 수 있는 기기인가" 를 답한다. 로그인한 기기가 여럿이어도
 * writer 는 하나뿐이다.
 *
 * auth token 과 같은 방식으로 **서버가 만든 opaque 값**이고 DB 에는 SHA-256 hex 만 둔다.
 * 서명도 claim 도 없어서 위조하려면 값을 맞히는 수밖에 없고, DB 가 통째로 새도 유효한
 * token 을 만들 수 없다.
 *
 * **token 값 자체를 로그 · 응답 · 오류 메시지에 남기지 않는다.** client 에 한 번 내려보내는
 * 것이 전부고, 그 뒤로는 client 의 IndexedDB 에만 있다.
 */

export type IssuedTrackerToken = {
  rawToken: string;
  tokenHash: string;
};

export function issueTrackerToken(): IssuedTrackerToken {
  const rawToken = randomBytes(32).toString("base64url");

  return { rawToken, tokenHash: hashTrackerToken(rawToken) };
}

export function hashTrackerToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}
