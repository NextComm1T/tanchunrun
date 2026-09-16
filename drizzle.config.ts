import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit 설정(D2 · D3-A).
 *
 * drizzle-kit 은 Next 밖에서 도는 별도 CLI 라 `.env.local` 을 스스로 읽지 않는다.
 * `dotenv` 는 추가 금지 dependency 이므로 Node 내장 `process.loadEnvFile` 을 쓴다
 * (Node 20.12+ · 이 저장소는 Node 24). 파일이 없으면 셸 env 로 넘어간다 —
 * CI · 배포에서 셸 env 로만 주는 경우를 막지 않기 위해서다.
 *
 * migration 은 forward-only 이고 생성된 SQL 을 **손으로 고치지 않는다**. 적용 주체는
 * local = 개발자, integration = merge/migration 담당, production = 배포 담당이다(D3-A).
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local 이 없는 환경(CI · 배포)에서는 셸 env 를 그대로 쓴다.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // `generate` 는 DB 에 접속하지 않아 이 값을 쓰지 않는다. `migrate` 만 쓴다.
    url: process.env.DATABASE_URL ?? "",
  },
});
