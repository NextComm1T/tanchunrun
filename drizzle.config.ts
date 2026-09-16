import Module from "node:module";

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

/**
 * `server-only` 를 drizzle-kit 안에서만 해석할 수 있게 한다.
 *
 * `src/server/**` 모듈은 `import "server-only"` 로 시작한다(#79). 그런데 drizzle-kit 은 Next
 * 밖에서 도는 CLI 라 Next 번들러의 alias 를 모르고, `schema.ts` 를 읽다가
 * `Cannot find module 'server-only'` 로 죽는다. #79 는 `server-only` 를 dependency 로 추가하는
 * 것을 금지한다.
 *
 * 그래서 **이 설정 파일 안에서만** resolver 를 한 겹 감싸 `server-only` 를 Next 가 이미 들고 있는
 * 빈 모듈로 보낸다(`next/dist/compiled/server-only/empty.js` — Next 자신이 서버 환경에서 쓰는
 * 바로 그 파일이다). 새 package 도, 새 소스 파일도 늘지 않는다.
 *
 * **앱에는 아무 영향이 없다.** Next 는 이 파일을 읽지 않으므로 `next dev` · `next build` 의
 * `server-only` 처리는 그대로고, 클라이언트 컴포넌트가 서버 모듈을 import 하면 여전히 빌드가 깨진다.
 * tsconfig `paths` 로 같은 일을 하면 Next 쪽 해석까지 바뀌어 그 보호가 조용히 풀릴 수 있다 —
 * 그래서 범위를 여기로 좁혔다.
 */
const moduleInternals = Module as unknown as {
  _resolveFilename(this: unknown, request: string, ...rest: unknown[]): string;
};
const resolveFilename = moduleInternals._resolveFilename;

moduleInternals._resolveFilename = function (request, ...rest) {
  if (request === "server-only") {
    return resolveFilename.call(
      this,
      "next/dist/compiled/server-only/empty.js",
      ...rest,
    );
  }
  return resolveFilename.call(this, request, ...rest);
};

/**
 * migration 이 쓸 접속 문자열(D3-A — **앱 runtime 은 pooled, migration 은 direct**).
 *
 * Neon 을 Vercel 통합으로 붙이면 `DATABASE_URL`(pooled · `-pooler` 호스트)과
 * `DATABASE_URL_UNPOOLED`(direct)가 함께 주입된다. pooled 는 PgBouncer transaction mode 라
 * 세션 수준 기능을 지원하지 않아 DDL 이 실패하거나 조용히 이상하게 돌 수 있다.
 *
 * 그래서 **direct 를 우선 집는다.** 로컬 Docker 처럼 pooler 가 없는 환경은
 * `DATABASE_URL_UNPOOLED` 가 없고 `DATABASE_URL` 이 이미 direct 라 그대로 동작한다.
 *
 * 값은 어디에도 출력하지 않는다 — 호스트에 `-pooler` 가 있는지만 본다.
 */
function migrationUrl(): string {
  // 빈 값(`KEY=`)은 미설정과 같다(`docs/PROJECT_COMMANDS.md`). `??` 로는 빈 문자열이 통과한다.
  const direct = process.env.DATABASE_URL_UNPOOLED?.trim();
  const fallback = process.env.DATABASE_URL?.trim();
  const url = direct || fallback || "";
  if (!url) return "";

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    // 형식이 틀린 값은 drizzle-kit 이 자기 오류로 알려 준다. 여기서 가로채지 않는다.
    return url;
  }

  /*
    pooled 인데 direct 대안이 없다. 조용히 도는 것이 가장 나쁘므로 멈춘다 —
    migration 이 반쯤 적용된 상태가 실패보다 훨씬 비싸다.
  */
  if (host.includes("-pooler")) {
    throw new Error(
      "migration 은 direct(unpooled) 접속으로만 실행한다. DATABASE_URL_UNPOOLED 를 설정하거나 DATABASE_URL 에 pooler 가 아닌 호스트를 넣는다(#78 D3-A).",
    );
  }

  return url;
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // `generate` 는 DB 에 접속하지 않아 이 값을 쓰지 않는다. `migrate` 만 쓴다.
    url: migrationUrl(),
  },
});
