import "server-only";

import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * 인증 기반 스키마(#79 · D2).
 *
 * 세 가지 원칙이 이 파일 전체를 지배한다.
 *
 * 1. **이메일 · 프로필 · OAuth token 을 영구 저장하지 않는다**(SP3). 그래서 어느 테이블에도
 *    email · nickname(provider 쪽) · picture · access_token · refresh_token · id_token 컬럼이
 *    없다. identity 는 `(provider, 검증된 sub)` 하나뿐이다.
 * 2. **카카오와 구글은 같은 사람이어도 다른 UID 다**(P11). 이건 DB 제약이 아니라 callback
 *    흐름으로 보장한다 — `oauth_accounts` 를 `(provider, provider_account_id)` 로 찾아
 *    없으면 새 user 를 만든다. email · profile 로 잇는 코드를 두지 않는다.
 * 3. **사용자 소유 행은 전부 `users` 에서 ON DELETE CASCADE** 로 지워진다(#88 탈퇴 · P13).
 *
 * enum 타입 대신 `text` + CHECK 을 쓴다. 값이 늘어날 때 migration 이 단순하다.
 *
 */

/** 저장되는 소셜 로그인 제공자. `oauth_accounts` · `auth_sessions` 가 공유한다. */
export const AUTH_PROVIDERS = ["kakao", "google"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

/**
 * 계정 상태(`docs/05-policy.md` 의 「가입 중」 → 「가입 완료」).
 * `signing_up` = 소셜 인증만 끝나고 닉네임 미설정. 닉네임 저장은 #80 이 한다.
 */
export const ACCOUNT_STATES = ["signing_up", "active"] as const;
export type AccountState = (typeof ACCOUNT_STATES)[number];

/**
 * 저장되는 동의 종류(#80 · D5). **단일 required 타입 하나뿐이다** — optional 항목도,
 * 그 밖의 `consent_type` 도 만들지 않는다. 문구 · 버전 상수는 화면 쪽
 * `src/app/signup/consent/consentSections.ts` 에 있다(D5 가 고지 문구 옆에 두라고 정했다).
 */
export const CONSENT_TYPES = ["privacy_collection_use"] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

/**
 * 러닝 세션의 진행 상태(#81). `active` 는 계정당 하나뿐이고 DB 가 그것을 보장한다(P7).
 * 종료 처리(`finished` 로의 전이)는 #85 가 한다.
 */
export const RUN_STATUSES = ["active", "finished"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/**
 * 종료 후 저장 진행 상태(#85 가 채운다). `active` 인 동안에는 null 이다.
 * `finished` + `pending`/`failed` 는 재시도 대상이라 `active` 와 구분된다.
 */
export const RUN_SAVE_STATES = ["pending", "saved", "failed"] as const;
export type RunSaveState = (typeof RUN_SAVE_STATES)[number];

/**
 * CHECK 제약에 쓸 `'a', 'b'` 목록. 허용값이 위 상수 배열 한 곳에서만 나오게 한다.
 *
 * `sql`${value}`` 로 쓰면 안 된다 — 그건 bind parameter 가 돼서 생성된 DDL 에
 * `in ($1, $2)` 가 그대로 박힌다(실제로 한 번 그렇게 나왔다). DDL 에는 리터럴이 필요하므로
 * `sql.raw` 로 넣는다. 값은 이 파일의 `as const` 상수뿐이라 외부 입력이 섞일 수 없다.
 */
function inList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(", "));
}

/**
 * 불변 UID. 한 번 발급되면 바뀌지 않고, 탈퇴 후 재가입해도 재사용하지 않는다
 * (`docs/06-data.md:14` · P13).
 *
 * `nickname` 은 가입 중에는 null 이고 #80 이 채운다. 길이 · 문자 규칙은 `src/domain/nickname.ts`
 * 가 갖고, **중복만 DB 가 막는다** — 앱이 먼저 SELECT 해서 판정하면 두 브라우저가 동시에
 * 제출했을 때 둘 다 통과한다.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountState: text("account_state").notNull().default("signing_up"),
    nickname: text("nickname"),
    signedUpAt: timestamp("signed_up_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "users_account_state_check",
      sql`${table.accountState} in (${inList(ACCOUNT_STATES)})`,
    ),
    /**
     * 닉네임 중복 금지. **영문 대소문자를 구분하지 않는다**(P10 · D4) — `Runner` 와 `runner`
     * 는 같은 닉네임이다. 그래서 컬럼이 아니라 `lower(nickname)` 표현식에 unique 를 건다.
     *
     * 정규화 컬럼을 따로 두지 않는 이유는 그 컬럼과 `nickname` 이 어긋날 수 있기 때문이다.
     * 표현식 index 는 어긋날 수가 없다. 값은 `domain/nickname.ts` 의 `normalizeNickname()`
     * 과 같아야 하므로 양쪽 다 locale 에 의존하지 않는 소문자 변환을 쓴다.
     *
     * 가입 중(`nickname IS NULL`) 사용자는 서로 충돌하지 않는다 — Postgres 의 unique 는
     * NULL 을 서로 다른 값으로 보기 때문에 부분 index 를 따로 쓸 필요가 없다.
     */
    uniqueIndex("users_nickname_lower_unique").on(sql`lower(${table.nickname})`),
  ],
);

/**
 * 개인정보 수집·이용 동의(#80 · D5).
 *
 * `UNIQUE(user_id, consent_type, version)` 이 **재동의를 idempotent 하게 만드는 장치**다.
 * 두 탭 · 더블 클릭 · 네트워크 재시도로 같은 요청이 여러 번 와도 `ON CONFLICT DO NOTHING`
 * 이 두 번째부터를 조용히 흘려보내고, 그래서 **최초 동의 시각(`agreed_at`)이 보존된다.**
 *
 * 없는 것과 그 이유:
 * - **IP · User-Agent · 기기 식별자 없음** — SP3 범위 밖이고 MVP 최소 설계다.
 * - **철회 · 이력 컬럼 없음** — 철회 UI 가 없고(#49 는 read-only), 탈퇴하면 `users` 에서
 *   CASCADE 로 전부 지워진다(P13).
 *
 * `agreed_at` 에 DB default 를 걸지 않는다. **서버가 INSERT 시점 값을 명시적으로 넣는다** —
 * client 가 보낸 시각을 신뢰하지 않는다는 것을 호출부에서 눈으로 확인할 수 있어야 한다.
 */
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    consentType: text("consent_type").notNull(),
    /** 고지 문구의 버전. 코드 상수(`PRIVACY_CONSENT_VERSION`)를 그대로 넣는다. */
    version: text("version").notNull(),
    agreedAt: timestamp("agreed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("consents_user_id_idx").on(table.userId),
    unique("consents_user_type_version_unique").on(
      table.userId,
      table.consentType,
      table.version,
    ),
    check(
      "consents_consent_type_check",
      sql`${table.consentType} in (${inList(CONSENT_TYPES)})`,
    ),
  ],
);

/**
 * 러닝 세션(#81 · D8 · D14).
 *
 * **이 테이블의 핵심은 `run_sessions_active_user_unique` 하나다.** 「계정당 진행 중인 러닝은
 * 최대 1개」(P7)를 앱이 아니라 **DB 가** 보장한다. 앱이 먼저 조회해서 없으면 INSERT 하는
 * 방식은 두 기기가 동시에 시작 버튼을 눌렀을 때 둘 다 통과한다. partial unique index 는
 * 반드시 한쪽만 통과시키고, 진 쪽은 `23505` 를 받아 `active_exists` 로 바뀐다.
 *
 * **tracker(D14 — single writer)**: 지금 측정을 올릴 수 있는 기기는 하나뿐이다. 서버는 어느
 * 기기가 tracker 인지 모르고 `tracker_generation` + `tracker_token_hash` 만 갖는다. client 가
 * IndexedDB 에 든 token 으로 자기가 writer 인지 판정한다. 다른 기기가 「이 기기에서 이어서
 * 측정」을 고르면 generation 이 1 오르고 token 이 바뀌어 이전 generation 은 봉인된다.
 * **자동 takeover 는 없다** — reload · 재로그인은 generation 을 바꾸지 않는다.
 *
 * auth session token 과 같은 방식으로 **해시만 저장**한다. DB 가 통째로 새도 유효한 tracker
 * token 을 만들어 낼 수 없다.
 *
 * 결과 컬럼(`zone_version` … `saved_at`)은 **#85 가 채운다.** 여기서는 자리만 만들고 값의
 * 의미를 고정하지 않는다 — 그래서 `rank_snapshot_kind` 에 CHECK 을 걸지 않았다. 값 집합은
 * #85 소유라 지금 박아 두면 #85 를 묶는다.
 */
export const runSessions = pgTable(
  "run_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    saveState: text("save_state"),

    /** 서버 시각이다. 경과 시간을 client 시계로 재지 않는다. */
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    finishReceivedAt: timestamp("finish_received_at", { withTimezone: true }),

    /** 시작 시각의 Asia/Seoul 날짜. 자정을 넘겨 달려도 시작일로 묶인다. */
    runDate: date("run_date").notNull(),

    // ── 결과 컬럼. #85 가 채운다 ──────────────────────────────────────────
    zoneVersion: text("zone_version"),
    totalDistanceM: integer("total_distance_m"),
    tancheonDistanceM: integer("tancheon_distance_m"),
    durationSec: integer("duration_sec"),
    avgPaceSecPerKm: integer("avg_pace_sec_per_km"),
    rankSnapshot: integer("rank_snapshot"),
    rankSnapshotKind: text("rank_snapshot_kind"),
    /** 갱신된 개인 최고 기록 항목의 이름들. */
    pbFlags: text("pb_flags").array(),
    savedAt: timestamp("saved_at", { withTimezone: true }),

    // ── tracker(D14) ────────────────────────────────────────────────────
    trackerGeneration: integer("tracker_generation").notNull().default(1),
    /** 현재 generation tracker token 의 SHA-256 hex. raw token 은 저장하지 않는다. */
    trackerTokenHash: text("tracker_token_hash").notNull(),
  },
  (table) => [
    index("run_sessions_user_id_idx").on(table.userId),
    /**
     * 계정당 진행 중 1개(P7). **부분 index 여야 한다** — 끝난 세션까지 덮으면 한 사람이
     * 러닝을 두 번 할 수 없게 된다.
     */
    uniqueIndex("run_sessions_active_user_unique")
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    check(
      "run_sessions_status_check",
      sql`${table.status} in (${inList(RUN_STATUSES)})`,
    ),
    check(
      "run_sessions_save_state_check",
      sql`${table.saveState} is null or ${table.saveState} in (${inList(RUN_SAVE_STATES)})`,
    ),
    check(
      "run_sessions_tracker_generation_check",
      sql`${table.trackerGeneration} >= 1`,
    ),
  ],
);

/**
 * 소셜 계정 ↔ user 연결.
 *
 * PK 가 `(provider, provider_account_id)` 라서 같은 소셜 계정이 두 user 에 붙을 수 없다(P11).
 * 최초 로그인 경합에서 두 요청이 동시에 들어와도 두 번째는 `23505` 로 떨어지고, 재시도하면
 * 먼저 만들어진 user 를 찾는다 — 그래서 동시 최초 로그인 2건에도 행이 1개다.
 *
 * `UNIQUE(user_id)` 는 **일부러 걸지 않는다**(Issue 명시). 지금은 한 user 에 account 가
 * 하나뿐이지만 스키마가 그걸 강제하지는 않는다.
 */
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    provider: text("provider").notNull(),
    /** 검증된 ID token 의 `sub`. client 입력을 그대로 넣지 않는다. */
    providerAccountId: text("provider_account_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "oauth_accounts_pkey",
      columns: [table.provider, table.providerAccountId],
    }),
    index("oauth_accounts_user_id_idx").on(table.userId),
    check(
      "oauth_accounts_provider_check",
      sql`${table.provider} in (${inList(AUTH_PROVIDERS)})`,
    ),
  ],
);

/**
 * 기기별 로그인 세션. 로그아웃은 이 행을 지우는 것이다.
 *
 * - `token_hash` 는 **SHA-256 hex 만** 담는다. raw token 은 cookie 에만 있고 DB 에 없다.
 * - `expires_at = created_at + 30일` 고정이다. 쓰더라도 연장하지 않는다(rolling 없음 · D2).
 *   그래서 두 값을 DB default 에 맡기지 않고 애플리케이션이 같은 시각 하나로 계산해 넣는다.
 * - `provider` 는 **이 세션을 만든 검증된 로그인 provider** 다. `getViewer().provider` 가
 *   이 값을 그대로 돌려준다.
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("auth_sessions_user_id_idx").on(table.userId),
    check(
      "auth_sessions_provider_check",
      sql`${table.provider} in (${inList(AUTH_PROVIDERS)})`,
    ),
  ],
);
