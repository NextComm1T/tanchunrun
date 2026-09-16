import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * 앱 runtime 의 DB 접근점(D2 · D3-A).
 *
 * **migration 을 여기서 실행하지 않는다.** 앱 시작 · 요청 처리 · `npm run build` 어디에서도
 * migration 이 돌면 안 된다(D3-A). 스키마 적용은 `npm run db:migrate` 뿐이다.
 *
 * `DATABASE_URL` 검사를 module top-level 이 아니라 첫 사용 시점에 하는 이유:
 * `next build` 가 route 모듈을 적재할 때 이 파일도 함께 평가된다. top-level 에서 던지면
 * DB 없이 빌드하는 것 자체가 막힌다. `Pool` 은 만들어져도 첫 쿼리 전에는 접속하지 않으므로
 * lazy 하게 두면 빌드가 DB 를 건드리지 않는다.
 */

let pool: Pool | undefined;

function getPool(): Pool {
  if (pool) return pool;

  const url = process.env.DATABASE_URL;
  if (!url) {
    // 값이 아니라 이름만 말한다.
    throw new Error("DATABASE_URL is not set");
  }

  pool = new Pool({
    connectionString: url,
    // 배포 환경은 Neon pooled URL 을 쓴다(D3-A). 서버리스에서 idle connection 을 오래
    // 붙들고 있지 않도록 짧게 끊는다.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  return pool;
}

let database: ReturnType<typeof createDatabase> | undefined;

function createDatabase() {
  return drizzle(getPool(), { schema });
}

/** 쿼리를 보낼 때 호출한다. 첫 호출에서만 Pool 과 drizzle 인스턴스를 만든다. */
export function getDb() {
  database ??= createDatabase();
  return database;
}

export type Db = ReturnType<typeof getDb>;
