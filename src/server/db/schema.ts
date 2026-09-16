import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
 * ---
 *
 * **이 파일만 `import "server-only"` 로 시작하지 않는다.** `src/server/**` 의 나머지 모듈은
 * 전부 붙어 있다. 이유는 `drizzle.config.ts` 가 이 파일을 가리키고, drizzle-kit 은 Next 밖에서
 * 도는 CLI 라 Next 내부 alias 인 `server-only` 를 해석하지 못하기 때문이다
 * (`Cannot find module 'server-only'` 로 `db:generate` 가 죽는다). #79 가 `server-only` 를
 * dependency 로 추가하는 것을 금지하므로 이 파일에서만 뺐다.
 *
 * 안전성은 그대로다 — 이 파일은 테이블 메타데이터뿐이고 secret · 접속 · 쿼리가 없다.
 * 실제 DB 에 닿는 `client.ts` 가 `server-only` 를 들고 있어서, 클라이언트 컴포넌트가 DB 로
 * 가려고 하면 여전히 빌드가 깨진다. (`modify/2026-09-16-auth.md` 6번)
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
 * `nickname` 은 여기서 null 을 허용만 하고 규칙 · unique index 는 #80 이 넣는다.
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
