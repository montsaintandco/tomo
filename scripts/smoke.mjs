// 운영 스모크 — 배포 직후(.github/workflows/smoke.yml)와 하루 1번 돈다. 의존성 없이 node 22 로 실행.
//   SMOKE_BASE_URL  확인할 주소(기본 NEXT_PUBLIC_SITE_URL)
//   EXPECT_SHA      주면 /api/health 의 version 이 이 커밋이 될 때까지 최대 SMOKE_WAIT_MIN 분(기본 10) 기다린다 — 안 바뀌면 배포 실패
//   OPS_TELEGRAM_BOT_TOKEN·OPS_TELEGRAM_CHAT_ID  있으면 실패를 텔레그램으로 알린다(없으면 Actions 실패 표시만)
// 사용: node scripts/smoke.mjs
const base = (process.env.SMOKE_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
const sha = process.env.EXPECT_SHA || "";
const waitMin = Number(process.env.SMOKE_WAIT_MIN || 10);
if (!base) { console.error("SMOKE_BASE_URL 이 없다"); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(base + path, { redirect: "follow", signal: AbortSignal.timeout(30_000), headers: { "user-agent": "tomo-smoke" } });
      return { status: r.status, text: await r.text() };
    } catch (e) {
      if (i >= 1) return { status: 0, text: String(e) };
      await sleep(5000); // 한 번만 다시
    }
  }
}

async function alert(text) {
  const { OPS_TELEGRAM_BOT_TOKEN: token, OPS_TELEGRAM_CHAT_ID: chat } = process.env;
  if (!token || !chat) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

const fails = [];

if (sha) {
  const until = Date.now() + waitMin * 60_000;
  let version = "";
  while (Date.now() < until) {
    const h = await get("/api/health");
    try { version = JSON.parse(h.text).version; } catch { version = `HTTP ${h.status}`; }
    if (version === sha) break;
    await sleep(20_000);
  }
  if (version !== sha) fails.push(`배포 미도착: ${waitMin}분 안에 ${sha.slice(0, 7)} 이 안 떴다(지금 ${String(version).slice(0, 12)})`);
  else console.log(`배포 도착 ${sha.slice(0, 7)}`);
}

const CHECKS = [
  ["/", (r) => r.status === 200],
  [`/global?q=${encodeURIComponent("ポケモン")}`, (r) => r.status === 200],
  ["/help", (r) => r.status === 200],
  ["/robots.txt", (r) => r.status === 200 && /user-agent/i.test(r.text)],
  ["/api/health", (r) => r.status === 200 && /"ok":true/.test(r.text)],
];
for (const [path, ok] of CHECKS) {
  const r = await get(path);
  const pass = ok(r);
  console.log(`${pass ? "OK  " : "FAIL"} ${r.status} ${path}`);
  if (!pass) fails.push(`${path} → ${r.status}${path === "/api/health" ? ` ${r.text.slice(0, 120)}` : ""}`);
}

if (fails.length) {
  await alert(`[TOMO 스모크 실패] ${base}${sha ? ` (${sha.slice(0, 7)})` : ""}\n- ${fails.join("\n- ")}`);
  console.error(fails.join("\n"));
  process.exit(1);
}
console.log("스모크 통과");
