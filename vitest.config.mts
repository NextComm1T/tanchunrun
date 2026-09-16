import { defineConfig } from "vitest/config";

/**
 * `npm test` 는 **순수 함수만** 돈다.
 *
 * #82 가 `src/domain` 으로 시작했고, #83 이 `src/server/runs/ack.ts`(업로드 ACK 규칙)를
 * 더하면서 범위를 `src/**` 로 넓혔다. 넓힌 것은 경로뿐이고 기준은 그대로다 — DOM · DB ·
 * 네트워크가 필요한 코드는 여기서 돌리지 않는다. 화면(`src/app`)의 검증은 여전히
 * `npm run lint` · `npm run build` · 브라우저 확인이다(`docs/PROJECT_COMMANDS.md`).
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
