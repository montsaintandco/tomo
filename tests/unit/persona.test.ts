import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../lib/support-ai.server";
import { PERSONA } from "../../lib/support-ai";

describe("AI 상담원 페르소나", () => {
  it("ko·ja 프롬프트에 이름·성격·말투·기본 정보가 들어간다", () => {
    for (const lang of ["ko", "ja"] as const) {
      const p = buildSystemPrompt(lang, null);
      expect(p).toContain(`이름은 ${PERSONA.name[lang]}`);
      expect(p).toContain(PERSONA.character[lang]);
      expect(p).toContain("# 기본 정보");
      expect(p).toContain("Stripe");
      expect(p).not.toContain("토스");
    }
  });
});
