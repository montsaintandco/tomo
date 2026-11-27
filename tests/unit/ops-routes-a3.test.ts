import { describe, it, expect } from "vitest";
import { matchOps } from "../../lib/ops-api";

// A3(에어쉽 돈 화면)용 경로 — 돈은 money, 보류 해제는 ops. 경로 표가 바뀌어 scope 가 내려가면 여기서 잡는다.
const id = "11111111-2222-3333-4444-555555555555";
describe("운영 API A3 경로", () => {
  it("돈 경로는 money scope", () => {
    for (const [m, segs] of [
      ["GET", ["payouts", "summary"]],
      ["GET", ["users", id, "ledger"]],
      ["POST", ["users", id, "ledger_adjust"]],
      ["GET", ["payouts"]],
      ["GET", ["refunds"]],
      ["POST", ["refunds", id, "run"]],
      ["POST", ["disputes", id, "resolve"]],
      ["POST", ["users", id, "delete"]],
    ] as const) expect(matchOps(m, [...segs])?.route.need, segs.join("/")).toBe("money");
  });
  it("보류 해제는 ops, 메모 필수는 핸들러가 본다", () => {
    expect(matchOps("POST", ["listings", id, "release"])?.route.need).toBe("ops");
    expect(matchOps("GET", ["listings", id, "release"])).toBeNull();
  });
});
