import { matchOps } from "@/lib/ops-api";
import { opsAuth, opsFail } from "@/lib/ops-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 운영 API v1 (센터 → tomo, 서버 간 서명). 경로 표는 lib/ops-api.ts, 약속은 docs/aaa/12 9장.
// OPS_BRIDGE_SECRET 이 없으면 전부 503(되돌리기 = env 삭제).
async function handle(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!process.env.OPS_BRIDGE_SECRET) return opsFail(503, "ops bridge disabled");
  const m = matchOps(req.method, (await params).path ?? []);
  if (!m) return opsFail(404, "unknown ops route");
  const a = await opsAuth(req, m.route.need);
  if ("res" in a) return a.res;
  try {
    return await m.route.h(a.ctx, m.params);
  } catch (e) {
    return opsFail(500, e instanceof Error ? e.message : "ops error");
  }
}
export { handle as GET, handle as POST };
