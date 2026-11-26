import { describe, it, expect } from "vitest";
import { jsonLd } from "../lib/json-ld";

describe("jsonLd", () => {
  it("escapes script-closing sequences so user text cannot break out of <script>", () => {
    const s = jsonLd({ name: '</script><script>alert(1)</script>' });
    expect(s).not.toContain("</script");
    expect(s).not.toContain("<");
    expect(JSON.parse(s).name).toBe('</script><script>alert(1)</script>');
  });
  it("round-trips ampersands and line separators", () => {
    const v = { a: "A&B\u2028C" };
    expect(JSON.parse(jsonLd(v))).toEqual(v);
  });
});
