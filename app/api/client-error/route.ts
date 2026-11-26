import { allow, clientIp } from "@/lib/ratelimit";
import { report } from "@/lib/observe";
import { createServerSupabase } from "@/lib/supabase/server";

// 브라우저 오류 수집(app/error.tsx·global-error.tsx). 비인증 공개 엔드포인트라 IP당 분당 10건, 본문 8KB까지만 읽는다. 항상 204.
// digest 가 있는 오류는 서버 예외가 화면에 전달된 것 — instrumentation.ts 가 이미 적재했으므로 건너뛴다.
export async function POST(req: Request) {
  if (!allow(`client-error:${clientIp(req)}`, 10)) return new Response(null, { status: 429 });
  let b: { message?: unknown; stack?: unknown; path?: unknown; digest?: unknown } = {};
  try { b = JSON.parse((await req.text()).slice(0, 8000)); } catch { return new Response(null, { status: 204 }); }
  if (typeof b.message !== "string" || !b.message || b.digest) return new Response(null, { status: 204 });
  let userId: string | null = null;
  try { userId = (await (await createServerSupabase()).auth.getUser()).data.user?.id ?? null; } catch { /* 비로그인·DB 장애 */ }
  report({ source: "client", message: b.message, stack: typeof b.stack === "string" ? b.stack : null, path: typeof b.path === "string" ? b.path : null, userId });
  return new Response(null, { status: 204 });
}
