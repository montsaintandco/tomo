import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, FilterTabs, Thumb, fmtDate, money, type Tone } from "@/components/admin/ui";
import DetailSheet from "@/components/admin/DetailSheet";
import MarketBidActions from "@/components/admin/MarketBidActions";
import MarketBidSettingsForm from "@/components/admin/MarketBidSettingsForm";
import { hrefWith } from "@/components/admin/paging";
import { nowMs } from "@/lib/admin-aging";
import { holdText, isMbTab, mbAging, mbOpsFor, MB_STATUS_LABEL, MB_TAB_LABEL, MB_TABS } from "@/lib/market-bid-admin";
import type { MarketBidStatus } from "@/lib/market-bid";

// 해외 마켓 경매 입찰 대행 운영(M5, 0052). 「입찰 필요」 줄(마감 임박순)을 보고 운영자가 메루카리에서 우리 계정으로 직접 입찰한 뒤
// 입찰 완료(금액·증빙)를 기록한다. 낙찰 처리 = 매입(카드) + 대행 주문(T 번호). 돈 판정은 DB, 매입·해제는 서버. 고객 화면 플래그와 상관없이 열린다
const TONE: Partial<Record<MarketBidStatus, Tone>> = { authorized: "amber", placed: "blue", outbid: "gray", hold: "red", won: "amber", ordered: "green", capture_failed: "red" };

type Item = {
  id: string; code: string; status: MarketBidStatus; source: string; source_id: string; url: string; title: string; image: string | null; nickname: string | null;
  cap_jpy: number; seen_price_jpy: number; seen_bids: number; domestic_ship_jpy: number; last_bid_jpy: number | null; is_top: boolean | null; ends_at: string;
  auth_krw: number; auth_expires_at: string | null; placed_at: string | null; final_price_jpy: number | null; capture_krw: number | null; captured_krw: number | null;
  order_id: string | null; order_code: string | null; order_request_id: string | null; request_status: string | null; hold_reason: string | null; fail_reason: string | null;
  updated_at: string; closed_at: string | null;
};
type Detail = {
  bid: Item & { rate: number; fee_jpy: number; pccc: string | null; ship_name: string; ship_address: string; created_at: string; authorized_at: string | null };
  item: { url: string; title: string; title_translated: string | null; image: string | null } | null;
  user: { id: string; nickname: string | null; country: string } | null;
  auths: { id: string; status: string; amount_krw: number; captured_krw: number | null; payment_intent_id: string | null; capture_before: string | null; release_reason: string | null; created_at: string }[];
  events: { id: number; kind: string; amount_jpy: number | null; evidence: Record<string, unknown>; actor: string | null; at: string }[];
  order: { id: string; code: string; status: string; total: number; paid_krw: number | null } | null;
  request: { id: string; status: string } | null;
  settings: { accepting: boolean; cap_max_jpy: number; max_open: number; max_open_per_user: number; daily_cap_jpy: number; min_lead_minutes: number; max_lead_hours: number };
};
const left = (iso: string, now: number) => {
  const m = Math.round((new Date(iso).getTime() - now) / 60e3);
  if (m < 0) return "마감 지남";
  return m < 120 ? `${m}분 남음` : `${Math.floor(m / 60)}시간 ${m % 60}분 남음`;
};

export default async function AdminMarketBidsPage(props: { searchParams: Promise<{ tab?: string; q?: string; open?: string }> }) {
  const sp = await props.searchParams;
  const tab = isMbTab(sp.tab) ? sp.tab : "to_place";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const supabase = await createServerSupabase();
  const [list, counts, detail, settings] = await Promise.all([
    supabase.rpc("admin_market_bids", { p_tab: tab, p_q: q || null, p_limit: 100, p_offset: 0 }),
    supabase.rpc("market_bid_ops_counts"),
    sp.open && /^[0-9a-f-]{36}$/i.test(sp.open) ? supabase.rpc("admin_market_bid_detail", { p_id: sp.open }) : Promise.resolve(null),
    supabase.from("market_bid_settings").select("accepting, cap_max_jpy, max_open, max_open_per_user, daily_cap_jpy, min_lead_minutes, max_lead_hours").maybeSingle(),
  ]);
  const items = ((list.data as { items: Item[] } | null)?.items ?? []);
  const total = (list.data as { total: number } | null)?.total ?? 0;
  const c = (counts.data ?? {}) as Record<string, number>;
  const now = nowMs();
  const keep = { tab, q: q || undefined };
  const closeHref = hrefWith("/admin/market-bids", keep);
  const d = (detail?.data ?? null) as Detail | null;

  return (
    <>
      <PageHeader title="마켓 입찰" sub={`입찰 필요 ${c.to_place ?? 0}(2시간 안 ${c.to_place_soon ?? 0}) · 입찰 중 ${c.bidding ?? 0} · 보류 ${c.hold ?? 0} · 낙찰 구매 필요 ${c.to_buy ?? 0} · 매입 실패 ${c.capture_failed ?? 0} · 접수 ${settings.data?.accepting ? "받는 중" : "멈춤"}`} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <FilterTabs base="/admin/market-bids" param="tab" current={tab} keep={keep} options={MB_TABS.map((v) => ({ value: v, label: MB_TAB_LABEL[v] }))} />
        <form className="flex gap-1.5" action="/admin/market-bids">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={q} placeholder="MB·T 번호·메루카리 id·제목" aria-label="입찰 신청 검색"
            className="h-8 w-56 rounded-md border border-[var(--a-border)] bg-white px-2 text-[12px]" />
          <button className="press rounded-md bg-tomo-navy/5 px-3 text-[12px] font-bold">검색</button>
        </form>
      </div>
      <Panel>
        {list.error ? <p className="a-faint p-4 text-[13px]">목록을 읽지 못했어요: {list.error.message}</p> : (
          <Table head={["번호", "상품(메루카리)", "고객", "상태", "상한가 · 우리 입찰", "마감", "승인액", "표시", ""]} empty="해당하는 신청이 없어요">
            {items.map((r) => {
              const ag = mbAging(r, now);
              return (
                <tr key={r.id} data-mb={r.code}>
                  <td className="tnum whitespace-nowrap font-semibold">{r.code}{r.order_code && <p className="a-faint text-[11px]">→ {r.order_code}</p>}</td>
                  <td className="max-w-[240px]">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="a-link flex items-center gap-2"><Thumb src={r.image} /><span className="truncate">{r.title}</span> ↗</a>
                    <p className="a-faint text-[11px]">신청 때 현재가 {money(r.seen_price_jpy, "JPY")} · 입찰 {r.seen_bids}건 · 송료 {money(r.domestic_ship_jpy, "JPY")}</p>
                  </td>
                  <td className="whitespace-nowrap">{r.nickname ?? "—"}</td>
                  <td><Pill tone={TONE[r.status] ?? "gray"}>{MB_STATUS_LABEL[r.status] ?? r.status}</Pill>{r.hold_reason && <p className="a-faint text-[11px]">{holdText(r.hold_reason)}</p>}</td>
                  <td className="tnum whitespace-nowrap">{money(r.cap_jpy, "JPY")}<span className="a-faint ml-1 text-[11px]">{r.last_bid_jpy != null ? `우리 ${money(r.last_bid_jpy, "JPY")}${r.is_top ? " · 1등" : ""}` : "입찰 전"}</span></td>
                  <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.ends_at)}<p className="text-[11px]">{left(r.ends_at, now)}</p></td>
                  <td className="tnum whitespace-nowrap">{money(r.captured_krw ?? r.auth_krw, "KRW")}{r.captured_krw != null && <span className="a-faint ml-1 text-[11px]">매입</span>}</td>
                  <td className="whitespace-nowrap">{ag && <Pill tone={ag.level === "late" ? "red" : "amber"}>{ag.text}</Pill>}</td>
                  <td className="text-right"><Link href={hrefWith("/admin/market-bids", keep, { open: r.id })} scroll={false} className="a-link text-[12px]">열기</Link></td>
                </tr>
              );
            })}
          </Table>
        )}
        {total > items.length && <p className="a-faint px-3 py-2 text-[12px]">{total}건 중 {items.length}건. 번호로 검색하세요</p>}
      </Panel>

      <details className="mt-4 rounded-lg border border-[var(--a-border)]">
        <summary className="cursor-pointer px-3 py-2 text-[13px] font-semibold">접수 스위치·한도 · 수동 입찰 절차</summary>
        {settings.data && <MarketBidSettingsForm initial={settings.data} />}
        <ol className="a-muted list-decimal px-8 pb-3 text-[12px] leading-6">
          <li>「입찰 필요」에서 마감이 가까운 줄부터 연다. 상품(↗)을 메루카리에서 열어 경매가 진행 중인지, 송료가 출품자 부담인지 본다.</li>
          <li>우리 계정으로 「현재가 + 100엔」(입찰 0건이면 시작가)만 넣는다. 상한가를 그대로 넣지 않는다. 상한가를 넘으면 넣지 않는다.</li>
          <li>입찰 직후 메루카리 화면의 입찰액·마감 시각을 확인하고 「입찰됨 기록」에 금액·마감·증빙 메모(시각·화면 내용)를 적는다.</li>
          <li>밀리면 「밀림」을 적고, 상한가 안이면 다시 넣은 뒤 「입찰됨 기록」을 다시 한다.</li>
          <li>마감 뒤: 우리가 이겼으면 「낙찰 처리」(낙찰가 = 우리 마지막 입찰액, 송료) → 매입 금액 확인 → 실행. 그다음 24시간 안에 메루카리에서 구매한다(대행 주문 T 번호로 이어짐).</li>
          <li>졌으면 「유찰 처리」에 본 낙찰가를 적는다(승인 해제). 제출했는지 모르겠으면 「보류」로 두고 확인한다. 마감 30분 전까지 입찰을 못 넣으면 자동 취소된다.</li>
        </ol>
      </details>

      {sp.open && (d ? <BidDetail d={d} closeHref={closeHref} now={now} /> : (
        <DetailSheet title="입찰 신청" closeHref={closeHref}><p className="a-muted">{detail?.error ? `읽지 못했어요: ${detail.error.message}` : "신청을 찾지 못했어요."}</p></DetailSheet>
      ))}
    </>
  );
}

function BidDetail({ d, closeHref, now }: { d: Detail; closeHref: string; now: number }) {
  const b = d.bid;
  const ops = mbOpsFor(b.status, !!b.placed_at);
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--a-border)] py-1.5 last:border-b-0">
      <span className="a-muted shrink-0">{k}</span><span className="min-w-0 break-words text-right">{v}</span>
    </div>
  );
  const ag = mbAging({ ...b, request_status: d.request?.status ?? null }, now);
  return (
    <DetailSheet closeHref={closeHref} title={`${b.code} · ${d.item?.title_translated || d.item?.title || ""}`}
      sub={<><Pill tone={TONE[b.status] ?? "gray"}>{MB_STATUS_LABEL[b.status] ?? b.status}</Pill>{ag && <span className="ml-1"><Pill tone={ag.level === "late" ? "red" : "amber"}>{ag.text}</Pill></span>}</>}>
      <section className="mb-4">
        {row("메루카리", d.item ? <a href={d.item.url} target="_blank" rel="noopener noreferrer" className="a-link">{d.item.title} ↗</a> : "—")}
        {row("고객", d.user ? <Link href={`/admin/users/${d.user.id}`} className="a-link">{d.user.nickname ?? "—"}</Link> : "—")}
        {row("상한가 · 우리 마지막 입찰", `${money(b.cap_jpy, "JPY")} · ${b.last_bid_jpy != null ? money(b.last_bid_jpy, "JPY") : "입찰 전"}`)}
        {row("마감", `${fmtDate(b.ends_at)} (${left(b.ends_at, now)})`)}
        {row("일본 내 송료(신청 때)", money(b.domestic_ship_jpy, "JPY"))}
        {row("승인액(최대 결제액)", `${money(b.auth_krw, "KRW")} · 승인 만료 ${b.auth_expires_at ? fmtDate(b.auth_expires_at) : "—"}`)}
        {b.final_price_jpy != null && row("낙찰가", money(b.final_price_jpy, "JPY"))}
        {b.capture_krw != null && row("매입 금액", `${money(b.capture_krw, "KRW")}${b.captured_krw != null ? " · 매입 완료" : ""}`)}
        {d.order && row("대행 주문", <Link href={`/admin/orders?q=${d.order.code}`} className="a-link">{d.order.code} · {d.request?.status ?? d.order.status}</Link>)}
        {b.hold_reason && row("보류 사유", holdText(b.hold_reason))}
        {b.fail_reason && row("종료 사유", b.fail_reason)}
        {row("배송지", `${b.ship_name} · ${b.ship_address}`)}
      </section>
      {ops.length > 0 && (
        <section className="mb-4 flex flex-col items-end gap-2" aria-label="조작">
          {ops.map((op) => <MarketBidActions key={op} op={op} bid={{ id: b.id, code: b.code, status: b.status, cap_jpy: b.cap_jpy, last_bid_jpy: b.last_bid_jpy,
            domestic_ship_jpy: b.domestic_ship_jpy, rate: Number(b.rate), fee_jpy: b.fee_jpy, auth_krw: b.auth_krw, ends_at: b.ends_at }} />)}
        </section>
      )}
      <Panel title="카드 승인" count={d.auths.length} className="mb-4">
        <Table head={["상태", "승인액", "매입", "PaymentIntent", "만료"]} empty="승인 행이 없어요">
          {d.auths.map((a) => (
            <tr key={a.id}><td>{a.status}{a.release_reason && <span className="a-faint ml-1 text-[11px]">{a.release_reason}</span>}</td>
              <td className="tnum">{money(a.amount_krw, "KRW")}</td><td className="tnum">{a.captured_krw != null ? money(a.captured_krw, "KRW") : "—"}</td>
              <td className="a-faint text-[11px]">{a.payment_intent_id ?? "—"}</td><td className="a-faint tnum">{a.capture_before ? fmtDate(a.capture_before) : "—"}</td></tr>
          ))}
        </Table>
      </Panel>
      <Panel title="사건 기록" count={d.events.length}>
        <ul className="px-3 py-2 text-[12px]">
          {d.events.map((e) => (
            <li key={e.id} className="border-b border-[var(--a-border)] py-1.5 last:border-b-0">
              <span className="a-faint tnum mr-1.5">{fmtDate(e.at)}</span><b>{e.kind}</b>{e.amount_jpy != null && ` · ${money(e.amount_jpy, "JPY")}`} · {e.actor ?? "시스템"}
              {typeof e.evidence.note === "string" && e.evidence.note && <span className="a-muted"> · {e.evidence.note}</span>}
              {typeof e.evidence.reason === "string" && <span className="a-muted"> · {holdText(e.evidence.reason)}</span>}
            </li>
          ))}
        </ul>
      </Panel>
    </DetailSheet>
  );
}
