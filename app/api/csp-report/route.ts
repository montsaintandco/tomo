import { allow, clientIp } from "@/lib/ratelimit";
import { cspReports, report } from "@/lib/observe";

// CSP Report-Only 위반 수집 → error_events(source csp, 막힌 출처별로 합쳐 count). 텔레그램은 보내지 않는다. 2주 모은 뒤 강제 전환을 따로 판단한다.
export async function POST(req: Request) {
  if (!allow(`csp:${clientIp(req)}`, 20)) return new Response(null, { status: 429 });
  const body = (await req.text()).slice(0, 4000); // 비인증 공개 엔드포인트 — 폭주 방지로 잘라서 읽는다
  console.warn("csp-violation", body.slice(0, 2000));
  try { for (const r of cspReports(JSON.parse(body)).slice(0, 5)) report({ source: "csp", ...r }); } catch { /* 잘린·깨진 JSON */ }
  return new Response(null, { status: 204 });
}