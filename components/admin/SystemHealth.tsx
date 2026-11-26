import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { opsAlertConfigured } from "@/lib/notify-ops";
import { tableMissing } from "@/lib/safe";
import { Panel, Pill } from "@/components/admin/ui";

// 24시간 안에 다시 난 오류 종류 + 그 조회에 걸린 시간(DB 응답)
async function load() {
  const supabase = await createServerSupabase();
  const t = Date.now();
  const { data, error } = await supabase.from("error_events").select("source").gte("last_at", new Date(t - 86_400_000).toISOString()).limit(1000);
  return { data, error, ms: Date.now() - t, up: Math.floor(process.uptime() / 60) };
}

// 대시보드의 시스템 상태 한 줄 — 배포 버전·서버 가동 시간·DB 응답·24시간 오류·운영 알림 설정. 서버 컴포넌트
export default async function SystemHealth() {
  const { data, error, ms, up } = await load();
  const by = (s: string) => (data ?? []).filter((r) => r.source === s).length;
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA;

  const cell = (label: string, value: React.ReactNode) => (
    <div className="min-w-0"><p className="a-faint text-[11px]">{label}</p><div className="mt-0.5 text-[13px]">{value}</div></div>
  );
  return (
    <Panel title="시스템 상태" className="mb-4" actions={<Link href="/admin/errors" className="a-link text-[12px]">오류 기록 →</Link>}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-3 py-3 md:grid-cols-5">
        {cell("배포 버전", <span className="tnum">{sha ? sha.slice(0, 7) : "로컬"}</span>)}
        {cell("서버 가동", <span className="tnum">{up >= 1440 ? `${Math.floor(up / 1440)}일` : up >= 60 ? `${Math.floor(up / 60)}시간` : `${up}분`}</span>)}
        {cell("DB 응답", error && !tableMissing(error) ? <Pill tone="red">오류</Pill> : <span className="tnum">{ms}ms</span>)}
        {cell("24시간 오류(종류)", tableMissing(error) ? <span className="a-muted">0032 미적용</span> : (
          <span className="tnum">서버 <b className={by("server") ? "text-tomo-coral-deep" : ""}>{by("server")}</b> · 브라우저 {by("client")} · CSP {by("csp")}</span>
        ))}
        {cell("운영 알림", opsAlertConfigured() ? <Pill tone="green">텔레그램 켜짐</Pill> : <span className="a-muted">꺼짐 · 이 화면에만 기록</span>)}
      </div>
    </Panel>
  );
}
