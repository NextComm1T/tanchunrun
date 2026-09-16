import { defineConfig } from "vitest/config";

/**
 * `npm test` 는 `src/domain` 의 순수 함수만 돈다(D12).
 *
 * 화면(`src/app`)에는 아직 테스트 러너가 없다 — 검증은 `npm run lint` · `npm run build` ·
 * 브라우저 확인이다(`docs/PROJECT_COMMANDS.md`).
 */
export default defineConfig({
  test: {
    include: ["src/domain/**/*.test.ts"],
  },
});
