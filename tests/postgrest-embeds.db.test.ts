// 0051 재발 방지 — PostgREST 임베드(표 안에 다른 표 끼워 읽기)가 깨지는지 배포 전에 잡는다.
// 2026-11-27 사고: 0041 이 listings.held_tx_id → transactions FK 를 더해 transactions↔listings 관계가 2개가 되자
// 코드의 listings(...) 임베드가 PGRST201(모호)로 실패해 거래 상세·내역·어드민 거래 목록이 5시간 비었다.
// 기존 db-tests 는 표를 직접 읽기만 하고 임베드를 쓰지 않았고, smoke 는 로그인 없는 공개 화면만 봐서 못 잡았다.
// 1) DB 의 FK 목록(OpenAPI)에서 FK 가 2개 이상인 표 쌍을 뽑고, 코드의 .from("표").select("...") 안 임베드 중
//    그 쌍을 관계 이름(표!fk_이름) 없이 쓰는 곳이 있으면 실패 → 새 FK 를 더하면 여기서 바로 잡힌다.
// 2) 코드의 임베드 select(${...} 를 끼우지 않은 것)를 실제로 limit=0 으로 보내 200 인지 본다(모호·관계 이름 오타·없는 칸).
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers: Record<string, string> = key ? { apikey: key, authorization: `Bearer ${key}` } : {};

type Sel = { file: string; table: string; select: string; dynamic: boolean };
type Embed = { parent: string; child: string; hinted: boolean };

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

/** 코드의 .from("표").select(문자열) 전부. 문자열 안 ${...} 는 지운다(끼운 칸 목록은 임베드가 아니라고 본다) */
function codeSelects(): Sel[] {
  const out: Sel[] = [];
  for (const file of ["app", "components", "lib"].flatMap(files)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\.from\(\s*["'](\w+)["']\s*\)\s*\.select\(\s*([`"'])([\s\S]*?)\2/g)) {
      out.push({ file, table: m[1], select: m[3].replace(/\$\{[^}]*\}/g, ""), dynamic: m[3].includes("${") });
    }
  }
  return out;
}

/** select 글의 임베드를 (부모 표, 끼운 표, 관계 이름 있음) 로 푼다. 예: transactions(id, listings(title)) */
function embedsOf(table: string, select: string): Embed[] {
  const out: Embed[] = [];
  const stack = [table];
  for (let i = 0; i < select.length; i++) {
    const c = select[i];
    if (c === "(") {
      const tok = /([\w!:]+)\s*$/.exec(select.slice(0, i))?.[1] ?? "";
      const [name, ...mods] = tok.replace(/^\w+:/, "").split("!");
      out.push({ parent: stack[stack.length - 1], child: name, hinted: mods.some((x) => x !== "inner" && x !== "left") });
      stack.push(name);
    } else if (c === ")") stack.pop();
  }
  return out;
}

const pairKey = (a: string, b: string) => [a, b].sort().join("|");
let ambiguous = new Set<string>();

describe.skipIf(!key)("PostgREST 임베드 (0051 재발 방지)", () => {
  beforeAll(async () => {
    const r = await fetch(`${url}/rest/v1/`, { headers });
    expect(r.status, "OpenAPI 조회").toBe(200);
    const spec = (await r.json()) as { definitions?: Record<string, { properties?: Record<string, { description?: string }> }> };
    const n = new Map<string, number>();
    for (const [t, d] of Object.entries(spec.definitions ?? {})) {
      for (const p of Object.values(d.properties ?? {})) {
        const fk = /<fk table='([^']+)'/.exec(p.description ?? "")?.[1];
        if (fk && fk !== t) n.set(pairKey(t, fk), (n.get(pairKey(t, fk)) ?? 0) + 1);
      }
    }
    expect(n.size, "FK 목록을 못 읽음").toBeGreaterThan(10);
    ambiguous = new Set([...n].filter(([, c]) => c > 1).map(([k]) => k));
  });

  it("FK 가 2개 이상인 표 쌍의 임베드는 관계 이름을 쓴다", () => {
    const bad = codeSelects().flatMap((s) => embedsOf(s.table, s.select)
      .filter((e) => !e.hinted && ambiguous.has(pairKey(e.parent, e.child)))
      .map((e) => `${s.file}: ${e.parent} → ${e.child}(...) — FK 여러 개(${pairKey(e.parent, e.child)}), ${e.child}!<fk_이름>( 로 쓸 것`));
    expect(bad).toEqual([]);
  });

  it("transactions↔listings 는 FK 1개(transactions.listing_id)뿐 — listings→transactions FK 를 다시 만들지 않는다", () => {
    expect(ambiguous.has(pairKey("transactions", "listings"))).toBe(false);
  });

  it("핵심 임베드가 실제로 성공한다(거래·후기·경매)", async () => {
    for (const q of [
      "transactions?select=id,listings!transactions_listing_id_fkey(id,title)",
      "transactions?select=id,listings(id)",
      "reviews?select=id,transactions(id,listings!transactions_listing_id_fkey(title))",
      "auctions?select=id,listings(id,title,sale_type)",
    ]) {
      const r = await fetch(`${url}/rest/v1/${q}&limit=0`, { headers });
      expect(r.status, `${q} ${r.status === 200 ? "" : await r.text()}`).toBe(200);
    }
  });

  it("코드의 임베드 select 가 전부 PostgREST 에서 통한다", async () => {
    const fails: string[] = [];
    for (const s of codeSelects().filter((x) => !x.dynamic && x.select.includes("("))) {
      const sel = s.select.replace(/\s+/g, "");
      const r = await fetch(`${url}/rest/v1/${s.table}?select=${encodeURIComponent(sel)}&limit=0`, { headers });
      if (r.status !== 200) fails.push(`${s.file}: ${s.table} ${r.status} ${(await r.text()).slice(0, 160)}`);
    }
    expect(fails).toEqual([]);
  });
});
