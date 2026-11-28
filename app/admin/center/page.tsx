import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, TX_META, PROXY_META, fmtDate } from "@/components/admin/ui";
import TxActions from "@/components/TxActions";
import ProxyActions from "@/components/ProxyActions";
import InspectionList from "@/components/InspectionList";
import InspectionForm from "@/components/admin/InspectionForm";
import CenterAddressForm from "@/components/admin/CenterAddressForm";
import { CenterStepForm, MeasuredWeightForm, CustomsSettleForm, ShipRateEditor } from "@/components/admin/CenterExtras";
import { loadInspectionsMany, centerMatchTag, type Inspection } from "@/lib/inspection";
import { parseOrderCode, orderLabel } from "@/lib/order-code";
import Link from "next/link";

type TxRow = {
  id: string; code: string | null; status: string; center: string | null; domestic_tracking: string | null; is_cross_border: boolean; meetup: boolean; updated_at: string;
  listings: { title: string } | null; buyer: { nickname: string } | null; seller: { nickname: string } | null;
  currency: string; customs_deposit: number; customs_actual: number | null; customs_shortfall: number; customs_settled_at: string | null;
  ship_weight_kg: number | null; measured_weight_kg: number | null; ship_overage: number;
  tx_center_steps: { ref: string | null; memo: string; done_at: string | null; due_at: string } | null;
};
type PrRow = {
  id: string; status: string; center: string | null; updated_at: string; order_id: string | null;
  external_items: { title: string | null } | null; proxy_orders: { code: string | null } | null; customer: { nickname: string } | null;
};
type Addr = { center: string; recipient: string; postal: string | null; address: string; phone: string | null; updated_at: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 센터 큐 — 한국/일본 센터별로 직거래(판매자가 센터로 보낸 상품)와 구매대행(TOMO 가 산 상품)의 입고·검수·국제 발송.
// 검색: 상자에 적힌 「TOMO TX000123」·「T000045」(주문 번호) 또는 uuid. 검수 기록은 추가만(0054), 구매자·판매자가 거래 화면에서 읽는다.
export default async function AdminCenterPage(props: { searchParams: Promise<{ q?: string }> }) {
  const sp = await props.searchParams;
  const raw = String(sp.q ?? "").trim().slice(0, 60);
  const q = raw.replace(/^TOMO\s*/i, "");
  const code = parseOrderCode(q);
  const supabase = await createServerSupabase();

  let tq = supabase.from("transactions")
    .select(`id, code, status, center, domestic_tracking, is_cross_border, meetup, updated_at, listings!transactions_listing_id_fkey(title),
      currency, customs_deposit, customs_actual, customs_shortfall, customs_settled_at, ship_weight_kg, measured_weight_kg, ship_overage,
      tx_center_steps!tx_center_steps_tx_id_fkey(ref, memo, done_at, due_at),
      buyer:profiles!transactions_buyer_id_fkey(nickname), seller:profiles!transactions_seller_id_fkey(nickname)`)
    .order("updated_at", { ascending: true }).limit(200);
  let pq = supabase.from("proxy_requests")
    .select(`id, status, center, updated_at, order_id, external_items(title), proxy_orders(code), customer:profiles!proxy_requests_user_id_fkey(nickname)`)
    .order("updated_at", { ascending: true }).limit(200);
  if (raw) {
    // 번호로 찾을 때는 단계와 상관없이(이미 발송·분쟁 중인 상자도) 보여 준다
    if (code?.kind === "tx") { tq = tq.eq("code", code.code); pq = pq.eq("id", "00000000-0000-0000-0000-000000000000"); }
    else if (code?.kind === "po") {
      const { data: po } = await supabase.from("proxy_orders").select("id").eq("code", code.code);
      const ids = (po ?? []).map((r) => r.id as string);
      pq = pq.in("order_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      tq = tq.eq("id", "00000000-0000-0000-0000-000000000000");
    } else if (UUID.test(q)) { tq = tq.eq("id", q); pq = pq.eq("id", q); }
    else {
      // 0057: 재팬비즈 입고 예정 번호·CarryToJ 신청번호로도 찾는다
      const { data: st } = await supabase.from("tx_center_steps").select("tx_id").eq("ref", q);
      const ids = (st ?? []).map((r) => r.tx_id as string);
      tq = tq.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]); pq = pq.eq("id", "00000000-0000-0000-0000-000000000000");
    }
  } else {
    // 0057: 센터 접수 번호를 넣어야 하는 결제 완료 건, 통관 정산이 남은 발송 건도 같이
    tq = tq.in("status", ["paid", "shipped_to_center", "center_received", "shipped_international", "delivered", "completed"]).eq("is_cross_border", true).eq("meetup", false);
    pq = pq.in("status", ["purchasing", "center_received"]);
  }
  const [{ data: td }, { data: pd }, { data: ad }] = await Promise.all([tq, pq, supabase.from("center_addresses").select("center, recipient, postal, address, phone, updated_at")]);
  const todo = (r: TxRow) => ["shipped_to_center", "center_received"].includes(r.status) || (!!r.tx_center_steps && !r.tx_center_steps.done_at)
    || (r.customs_deposit > 0 && !r.customs_settled_at && r.status !== "paid");
  const txs = ((td ?? []) as unknown as TxRow[]).filter((r) => raw || todo(r));
  const [{ data: rates }, { data: st }] = await Promise.all([
    supabase.from("intl_ship_rates").select("max_kg, cost_krw").order("max_kg"),
    supabase.from("intl_ship_settings").select("markup").maybeSingle(),
  ]);
  const prs = (pd ?? []) as unknown as PrRow[];
  const addrs = (ad ?? []) as Addr[];
  const [txInsp, prInsp] = await Promise.all([loadInspectionsMany(supabase, "tx", txs.map((r) => r.id)), loadInspectionsMany(supabase, "proxy", prs.map((r) => r.id))]);

  const Insp = ({ list, failed, kind, id, canReceive }: { list: Inspection[]; failed: boolean; kind: "tx" | "proxy"; id: string; canReceive: boolean }) => (
    <details className="mt-2">
      <summary className="a-link text-[12px]">검수 {failed ? "(확인 못 함)" : list.length ? `${list.length}건 · 최근 ${list[0].result === "ok" ? "정상" : "문제"}` : "기록 없음"} ▾</summary>
      <div className="reveal mt-2 flex flex-col gap-2">
        <InspectionList items={list} lang="ko" admin failed={failed} />
        <InspectionForm kind={kind} id={id} canReceive={canReceive} />
      </div>
    </details>
  );

  return (
    <>
      <PageHeader title="센터" sub="직거래는 판매자가 센터로 보낸 상품, 구매대행은 TOMO 가 산 상품이에요. 한국 센터 직거래 상자는 받는 사람 「몽상앤코 (TX000123)」, 일본 센터는 주소 끝 입고 예정 번호, 구매대행은 「TOMO T000045」로 찾아요. 결제되면 CarryToJ 신청·재팬비즈 입고 예정 등록부터 해요" />
      <form className="mb-4 flex gap-2" role="search" action="/admin/center">
        <input name="q" defaultValue={raw} placeholder="주문 번호(TOMO TX000123·T000045) 또는 uuid" aria-label="주문 번호 검색" className="h-8 w-80 max-w-full px-3 text-[13px]" />
        <button className="btn h-8 bg-tomo-navy px-3 text-[12px] text-white">찾기</button>
        {raw && <Link href="/admin/center" className="a-link self-center text-[12px]">전체 보기</Link>}
      </form>
      <details className="mb-4 text-[12px]">
        <summary className="a-link">한국→일본 국제배송 요율(CarryToJ 해상특송 ACE 원가 × 가산율, 10원 올림) ▾</summary>
        <div className="reveal mt-2"><ShipRateEditor rates={(rates ?? []) as { max_kg: number; cost_krw: number }[]} markup={Number(st?.markup ?? 1.1)} /></div>
      </details>
      {(["SEOUL", "NARITA"] as const).map((c) => {
        const t = txs.filter((r) => r.center === c);
        const p = prs.filter((r) => r.center === c);
        const addr = addrs.find((a) => a.center === c);
        return (
          <section key={c} className="mb-6">
            <h2 className="mb-2 text-[15px] font-bold">{c === "SEOUL" ? "한국 센터" : "일본 센터"}</h2>
            <Panel title="직거래(판매자 → 센터)" count={t.length} className="mb-3">
              <Table head={["번호 · 상품", "판매자 → 구매자", "국내 운송장", "상태", "갱신", "처리"]} empty={raw ? "이 센터에 맞는 거래 없음" : "대기 중인 거래 없음"}>
                {t.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td>
                      <span className="tnum block text-[12px] font-bold">{c === "SEOUL" ? orderLabel(r.code, r.id) : r.tx_center_steps?.ref ?? orderLabel(r.code, r.id)}</span>
                      <Link href={`/transactions/${r.id}`} className="a-link block max-w-[240px] truncate">{r.listings?.title ?? "—"}</Link>
                    </td>
                    <td className="whitespace-nowrap">{r.seller?.nickname} <span className="a-faint">→</span> {r.buyer?.nickname}</td>
                    <td className="tnum">{r.domestic_tracking ?? <span className="a-faint">—</span>}</td>
                    <td><Pill tone={TX_META[r.status]?.tone}>{TX_META[r.status]?.label ?? r.status}</Pill></td>
                    <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.updated_at)}</td>
                    <td className="min-w-[280px]">
                      <TxActions txId={r.id} status={r.status} isCrossBorder={r.is_cross_border} meetup={r.meetup} role="admin" lang="ko" />
                      {r.is_cross_border && !r.meetup && !["pending_payment", "paid", "shipped"].includes(r.status) && (
                        <Insp list={txInsp?.get(r.id) ?? []} failed={!txInsp} kind="tx" id={r.id} canReceive={r.status === "shipped_to_center"} />
                      )}
                      {r.tx_center_steps && !["cancelled", "pending_payment"].includes(r.status) && (
                        <CenterStepForm txId={r.id} center={c} current={r.tx_center_steps.done_at ? { ref: r.tx_center_steps.ref, memo: r.tx_center_steps.memo } : null} />
                      )}
                      {c === "SEOUL" && ["shipped_to_center", "center_received"].includes(r.status) && (
                        <MeasuredWeightForm txId={r.id} declared={r.ship_weight_kg} measured={r.measured_weight_kg} overage={r.ship_overage} />
                      )}
                      {r.customs_deposit > 0 && ["shipped_international", "delivered", "completed", "disputed"].includes(r.status) && (
                        <CustomsSettleForm txId={r.id} deposit={r.customs_deposit} currency={r.currency}
                          settled={r.customs_settled_at ? { actual: r.customs_actual, shortfall: r.customs_shortfall } : null} />
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            </Panel>
            <Panel title="구매대행(TOMO 구매 → 센터)" count={p.length} className="mb-3">
              <Table head={["번호 · 상품", "고객", "상태", "갱신", "처리"]} empty={raw ? "이 센터에 맞는 대행 없음" : "대기 중인 대행 없음"}>
                {p.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td>
                      <span className="tnum block text-[12px] font-bold">{centerMatchTag(orderLabel(r.proxy_orders?.code, r.order_id ?? r.id))}</span>
                      <Link href={`/proxy/${r.id}`} className="a-link block max-w-[240px] truncate">{r.external_items?.title ?? "—"}</Link>
                    </td>
                    <td className="whitespace-nowrap">{r.customer?.nickname ?? "—"}</td>
                    <td><Pill tone={PROXY_META[r.status]?.tone}>{PROXY_META[r.status]?.label ?? r.status}</Pill></td>
                    <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.updated_at)}</td>
                    <td className="min-w-[280px]">
                      <ProxyActions id={r.id} status={r.status} isOwner={false} isAdmin lang="ko" />
                      {!["requested", "quoted", "approved", "paid"].includes(r.status) && (
                        <Insp list={prInsp?.get(r.id) ?? []} failed={!prInsp} kind="proxy" id={r.id} canReceive={r.status === "purchasing"} />
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            </Panel>
            <details className="text-[12px]">
              <summary className="a-link">판매자 발송 안내 주소 {addr ? "" : "(미등록)"} ▾</summary>
              <div className="reveal mt-2"><CenterAddressForm center={c} initial={addr ?? null} /></div>
            </details>
          </section>
        );
      })}
    </>
  );
}