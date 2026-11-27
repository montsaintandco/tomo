// 운영 API 서명 호출 도구(점검·센터 개발용). 비밀값은 .env.local 의 OPS_BRIDGE_SECRET·OPS_BRIDGE_KEY_ID 를 읽고 출력하지 않는다.
// 사용: node node_modules/tsx/dist/cli.mjs scripts/ops-call.mts GET /api/ops/meta [--base https://tomo.airship.click] [--actor id:email] [--scope ops|money] [--body '{"..."}']
import { config } from "dotenv";
import { opsSign } from "../lib/ops-bridge.ts";

config({ path: ".env.local", quiet: true });
const [method = "GET", path = "/api/ops/meta", ...rest] = process.argv.slice(2);
const opt = (name: string, dflt = "") => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : dflt; };
const base = opt("base", "https://tomo.airship.click");
const [actorId = "", actorEmail = ""] = opt("actor").split(/:(.*)/s);
const scope = opt("scope");
const body = opt("body");
const secret = process.env.OPS_BRIDGE_SECRET;
const keyId = process.env.OPS_BRIDGE_KEY_ID || "k1";
if (!secret) throw new Error("OPS_BRIDGE_SECRET 없음(.env.local)");
const u = new URL(base + path); // 보낸 그대로(인코딩된) 경로+쿼리에 서명한다
const wire = u.pathname + u.search;
const ts = String(Math.floor(Date.now() / 1000));
const sig = opt("bad-sig") ? "0".repeat(64) : opsSign(secret, { keyId, ts, method, path: wire, actorId, actorEmail, scope, body });
const res = await fetch(u, {
  method,
  headers: {
    "x-ops-version": "1", "x-ops-key-id": keyId, "x-ops-ts": ts, "x-ops-sig": sig,
    ...(actorId || actorEmail ? { "x-ops-actor-id": actorId, "x-ops-actor-email": actorEmail } : {}),
    ...(scope ? { "x-ops-scope": scope } : {}),
    ...(body ? { "content-type": "application/json" } : {}),
  },
  body: body || undefined,
});
console.log(res.status, (await res.text()).slice(0, Number(opt("max", "4000"))));
