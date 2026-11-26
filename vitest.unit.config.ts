import { defineConfig } from "vitest/config";

// CI 게이트용 — DB(라이브 Supabase)가 필요 없는 순수 테스트만. DB 테스트는 vitest.config.ts(전체)로 돌린다.
// 새 DB 테스트는 tests/<이름>.db.test.ts 로 만들면 자동으로 빠진다.
const DB_TESTS = ["cart-rls", "chat", "curation-rls", "escrow", "listings-api", "notifications", "profile-country", "rls"].map((n) => `tests/${n}.test.ts`);

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"], exclude: ["node_modules/**", "**/*.db.test.ts", ...DB_TESTS], testTimeout: 20000 },
});
