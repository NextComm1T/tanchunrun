import "server-only";

import { and, eq } from "drizzle-orm";

import {
  PRIVACY_CONSENT_TYPE,
  PRIVACY_CONSENT_VERSION,
} from "@/app/signup/consent/consentSections";
import { getDb } from "@/server/db/client";
import { consents } from "@/server/db/schema";

/**
 * 개인정보 수집·이용 동의의 저장 · 조회(#80 · D5).
 *
 * 동의는 **단일 required 타입 하나**뿐이고 버전은 코드 상수다. 문구와 버전이 같은 파일에
 * 있어서(`consentSections.ts`) 문구를 고치는 사람이 버전을 함께 올린다.
 */

/**
 * 현재 버전 동의 행이 있는지 본다. **가입 재개가 이 값으로 갈린다**(D5) —
 * 없으면 `/signup/consent`, 있으면 `/signup/nickname`.
 *
 * 버전을 함께 보기 때문에 문구가 바뀌면 이전 버전에 동의한 사람은 `false` 가 된다.
 */
export async function hasCurrentConsent(userId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: consents.id })
    .from(consents)
    .where(
      and(
        eq(consents.userId, userId),
        eq(consents.consentType, PRIVACY_CONSENT_TYPE),
        eq(consents.version, PRIVACY_CONSENT_VERSION),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * 현재 버전 동의를 저장한다. **이미 있으면 아무것도 하지 않는다.**
 *
 * `ON CONFLICT DO NOTHING` 이 D5 의 idempotent 계약을 그대로 만든다 — 두 탭 · 더블 클릭 ·
 * 네트워크 재시도로 같은 요청이 여러 번 와도 행은 하나고 **최초 `agreed_at` 이 보존된다.**
 * `DO UPDATE` 로 바꾸면 동의 시각이 마지막 클릭으로 덮여 최초 동의 시점을 잃는다.
 *
 * `agreedAt` 은 **서버 시각**이다. client 가 보낸 시각을 받지 않는다.
 */
export async function insertCurrentConsent(userId: string): Promise<void> {
  await getDb()
    .insert(consents)
    .values({
      userId,
      consentType: PRIVACY_CONSENT_TYPE,
      version: PRIVACY_CONSENT_VERSION,
      agreedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [consents.userId, consents.consentType, consents.version],
    });
}
