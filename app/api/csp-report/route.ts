import { allow, clientIp } from "@/lib/ratelimit";

// CSP Report-Only 위반 수집 — Vercel 런타임 로그에서 "csp-violation"으로 검색. 토스 결제 1회 후 위반이 없으면 next.config.mjs를 강제 모드로.
export async function POST(req: Request) {
  if (!allow(`csp:${clientIp(req)}`, 20)) return new Response(null, { status: 429 });
  const body = (await req.text()).slice(0, 2000); // 비인증 공개 엔드포인트 — 로그 폭주 방지로 잘라서 기록
  console.warn("csp-violation", body);
  return new Response(null, { status: 204 });
}
