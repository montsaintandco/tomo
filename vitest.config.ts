import { defineConfig } from "vitest/config";
export default defineConfig({
  // 라이브 Supabase 공유 픽스처(alice·bob) — 파일 병렬이면 profile-country가 alice 국가를 잠깐 바꿔 escrow 테스트와 경합
  // CI(db-tests 작업)는 임시 Supabase 만 허용 — tests/setup/db-guard.ts
  test: { environment: "node", include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup/db-guard.ts"], testTimeout: 20000, fileParallelism: false },
});
