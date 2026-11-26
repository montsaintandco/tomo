import type { Instrumentation } from "next";

// 서버 렌더·라우트·액션·proxy 예외 → lib/observe(error_events + 텔레그램). 엣지 런타임에서는 건너뛴다(admin 클라이언트·fetch 경로가 node 전제).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { report } = await import("./lib/observe");
  const e = (err ?? {}) as { message?: string; stack?: string; digest?: string };
  report({ source: "server", message: `${e.message ?? String(err)} [${request.method} ${context.routeType} ${context.routePath}]`, stack: e.stack, path: request.path, digest: e.digest });
};
