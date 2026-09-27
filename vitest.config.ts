import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // 날짜 규칙은 사용자 로컬 자정 기준 — 테스트는 한국 시간으로 고정한다.
    env: { TZ: "Asia/Seoul" },
  },
});
