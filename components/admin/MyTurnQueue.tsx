import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { rows as safeRows } from "@/lib/safe";
import { PROXY_STAGE, STAGE_LABEL, nowMs, rankTurn, type TurnItem } from "@/lib/admin-aging";
import { Panel, AgeBadge } from "@/components/admin/ui";

const SHOW = 15;
const PER = 30;

// 「내 차례」 — 지금 운영자가 처리할 건을 지연 > 주의 > 보통, 같은 등급은 오래된 순으로 한 줄씩(에어쉽 MyTurnQueue 축소판).
// 행은 처리 화면으로 가는 링크만 있다. 돈·상태 RPC 를 여기서 부르지 않는다. 표가 없으면(마이그레이션 전) 그 줄만 빠진다
export default async function MyTurnQueue() {
  const supabase = await createServerSupabase();
  const [proxyRes, cancelRes, txRes, refundRes, payoutRes, reportRes, supportRes] = await Promise.all([
    supabase.from("proxy_requests").select("id, status, order_id, updated_at, external_items(title), profiles!proxy_requests_user_id_fkey(nickname)")
      .in("status", Object.keys(PROXY_STAGE)).order("updated_at", { ascending: true }).limit(PER),
    supabase.from("proxy_requests").select("id, cancel_requested_at").eq("status", "paid").not("cancel_requested_at", "is", null).limit(PER),
    supabase.from("transactions").select("id, status, updated_at, listings(title), buyer:profiles!transactions_buyer_id_fkey(nickname)")
      .in("status", ["disputed", "shipped_to_center", "center_received"]).order("updated_at", { ascending: true }).limit(PER),
    supabase.from("refunds").select("id, status, amount, currency, created_at").in("status", ["pending", "failed"]).order("created_at", { ascending: true }).limit(PER),
    supabase.from("payouts").select("id, amount, currency, requested_at, profiles!payouts_user_id_fkey(nickname)").eq("status", "requested").order("requested_at", { ascending: true }).limit(PER),
    supabase.from("reports").select("id, reason, created_at, snapshot").eq("status", "open").order("created_at", { ascending: true }).limit(PER),
    supabase.from("support_tickets").select("id, body, created_at, profiles(nickname)").eq("status", "open").order("created_at", { ascending: true }).limit(PER),
  ]);

  type Nick = { nickname: string } | null;
  const cancelAt = new Map((safeRows(cancelRes) as { id: string; cancel_requested_at: string }[]).map((r) => [r.id, r.cancel_requested_at]));
  const items: TurnItem[] = [];
  for (const r of safeRows(proxyRes) as unknown as { id: string; status: string; order_id: string | null; updated_at: string; external_items: { title: string } | null; profiles: Nick }[]) {
    const title = r.external_items?.title ?? "대행 상품";
    if (cancelAt.has(r.id)) {
      items.push({ key: `p${r.id}`, stage: "cancel_req", title, who: r.profiles?.nickname, since: cancelAt.get(r.id)!, href: "/admin/proxy?f=cancelreq" });
      continue;
    }
    const stage = PROXY_STAGE[r.status]!;
    const href = r.order_id && ["paid", "purchasing", "center_received"].includes(r.status) ? `/admin/orders?open=${r.order_id}` : `/admin/proxy?f=${r.status}`;
    items.push({ key: `p${r.id}`, stage, title, who: r.profiles?.nickname, since: r.updated_at, href });
  }
  for (const r of safeRows(txRes) as unknown as { id: string; status: string; updated_at: string; listings: { title: string } | null; buyer: Nick }[]) {
    const dispute = r.status === "disputed";
    items.push({ key: `t${r.id}`, stage: dispute ? "dispute" : "center", title: r.listings?.title ?? "거래", who: r.buyer?.nickname, since: r.updated_at, href: dispute ? "/admin/disputes" : "/admin/center" });
  }
  for (const r of safeRows(refundRes) as { id: string; status: string; amount: number; currency: string; created_at: string }[])
    items.push({ key: `r${r.id}`, stage: "refund", title: `환불 ${r.status === "failed" ? "실패" : "대기"} ${r.amount.toLocaleString("en-US")} ${r.currency}`, since: r.created_at, href: "/admin/refunds" });
  for (const r of safeRows(payoutRes) as unknown as { id: string; amount: number; currency: string; requested_at: string; profiles: Nick }[])
    items.push({ key: `o${r.id}`, stage: "payout", title: `출금 ${r.amount.toLocaleString("en-US")} ${r.currency}`, who: r.profiles?.nickname, since: r.requested_at, href: "/admin/payouts" });
  for (const r of safeRows(reportRes) as { id: string; reason: string; created_at: string; snapshot: { title?: string; nickname?: string } | null }[])
    items.push({ key: `s${r.id}`, stage: "report", title: r.snapshot?.title ?? r.snapshot?.nickname ?? "신고", since: r.created_at, href: "/admin/reports" });
  for (const r of safeRows(supportRes) as unknown as { id: string; body: string; created_at: string; profiles: Nick }[])
    items.push({ key: `q${r.id}`, stage: "support", title: r.body.slice(0, 60), who: r.profiles?.nickname, since: r.created_at, href: "/admin/support" });

  const now = nowMs();
  const ranked = rankTurn(items, now);
  const late = ranked.filter((r) => r.level === "late").length;
  const warn = ranked.filter((r) => r.level === "warn").length;

  return (
    <Panel title="내 차례" count={ranked.length} className="mb-4"
      actions={<span className="a-muted text-[12px]">{late ? <b className="text-tomo-coral-deep">지연 {late}</b> : "지연 0"} · 주의 {warn} · 오래된 순</span>}>
      {ranked.length === 0 ? <p className="a-muted px-3 py-8 text-center text-[13px]">지금 처리할 건이 없어요</p> : (
        <ul>
          {ranked.slice(0, SHOW).map((r) => (
            <li key={r.key} className="border-b border-[var(--a-border)] last:border-b-0">
              <Link href={r.href} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 hover:bg-[var(--a-hover)]">
                <span className="a-muted text-[12px] font-semibold">{STAGE_LABEL[r.stage]}</span>
                <span className="min-w-0 truncate">{r.title}{r.who && <span className="a-faint ml-1.5 text-[12px]">{r.who}</span>}</span>
                <AgeBadge since={r.since} level={r.level} now={now} />
              </Link>
            </li>
          ))}
          {ranked.length > SHOW && <li className="a-faint px-3 py-2 text-[12px]">그 밖에 {ranked.length - SHOW}건 · 아래 패널과 메뉴에서 보세요</li>}
        </ul>
      )}
    </Panel>
  );
}
