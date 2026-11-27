import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, FilterTabs, Thumb, fmtDate, money, type Tone } from "@/components/admin/ui";
import DetailSheet from "@/components/admin/DetailSheet";
import AuctionActions from "@/components/admin/AuctionActions";
import { hrefWith } from "@/components/admin/paging";
import { AUCTION_STATUS_LABEL, auctionAging, flagText, isAuctionTab, type AuctionStatus } from "@/lib/auction-admin";
import { nowMs } from "@/lib/admin-aging";

// 경매 운영(U5, 0048) — 목록(진행·결제 대기·미결제·끝남·의심), 상세(입찰 기록 원본·입찰자·경고·활동 기록), 강제 종료·입찰 무효·경고 해제.
// 상한가는 마감 뒤에만 보인다(admin_auction_detail). 화면 플래그 NEXT_PUBLIC_AUCTION 과 상관없이 열린다(경매가 없으면 빈 목록)

const TONE: Record<string, Tone> = { live: "blue", awaiting_payment: "amber", paid: "green", unsold: "gray", unpaid: "red", cancelled: "gray" };
const TABS = [
  { value: "live", label: "진행 중" }, { value: "awaiting", label: "결제 대기" }, { value: "unpaid", label: "미결제" },
  { value: "ended", label: "끝남" }, { value: "flagged", label: "의심 표시" }, { value: "all", label: "전체" },
];

type Item = {
  id: string; code: string; status: AuctionStatus; listing_id: string; title: string; image: string | null; listing_hidden: boolean;
  seller: { id: string; nickname: string | null }; leader_nickname: string | null; winner_nickname: string | null;
  currency: string; start_price: number; current_price: number; final_price: number | null; bid_count: number; bidder_count: number;
  ends_at: string; extended_count: number; closed_at: string | null; pay_due_at: string | null; flag_count: number; seller_choice_pending: boolean;
};
type Bidder = {
  bidder_id: string; nickname: string | null; joined_at: string | null; suspended: boolean | null; first_bid_at: string | null;
  max_amount: number | null; leading: boolean; voided: boolean; void_note: string | null; signals: string[]; active_strikes: number;
  bid_banned_until: string | null;
};
type Detail = {
  auction: Item & { leader_id: string | null; winner_id: string | null; tx_id: string | null; relist_of: string | null; original_ends_at: string;
    created_at: string; paid_at: string | null; max_visible: boolean; seller_choice_pending: boolean };
  listing: { id: string; title: string; status: string; hidden: boolean; hidden_by_admin: boolean } | null;
  seller: { id: string; nickname: string; suspended: boolean } | null;
  leader_nickname: string | null; winner_nickname: string | null;
  bids: { id: number; bidder_id: string; nickname: string | null; amount: number; kind: string; at: string; voided_at: string | null }[];
  bidders: Bidder[];
  strikes: { id: string; nickname: string | null; auction_code: string | null; created_at: string; lifted_at: string | null; note: string | null }[];
  chain: { id: string; code: string; status: string }[];
  actions: { id: number; action: string; admin: string | null; detail: Record<string, unknown>; created_at: string }[];
};
const ACTION: Record<string, string> = { auction_close: "강제 종료", auction_void_bid: "입찰 무효" };

export default async function AdminAuctionsPage(props: { searchParams: Promise<{ tab?: string; q?: string; open?: string }> }) {
  const sp = await props.searchParams;
  const tab = isAuctionTab(sp.tab) ? sp.tab : "live";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const supabase = await createServerSupabase();
  const [list, counts, detail] = await Promise.all([
    supabase.rpc("admin_auctions", { p_tab: tab, p_q: q || null, p_limit: 100, p_offset: 0 }),
    supabase.rpc("auction_ops_counts"),
    sp.open && /^[0-9a-f-]{36}$/i.test(sp.open) ? supabase.rpc("admin_auction_detail", { p_id: sp.open }) : Promise.resolve(null),
  ]);
  const items = ((list.data as { items: Item[] } | null)?.items ?? []);
  const total = (list.data as { total: number } | null)?.total ?? 0;
  const c = (counts.data ?? {}) as Record<string, number>;
  const now = nowMs();
  const keep = { tab, q: q || undefined };
  const closeHref = hrefWith("/admin/auctions", keep);
  const d = (detail?.data ?? null) as Detail | null;

  return (
    <>
      <PageHeader title="경매" sub={`진행 ${c.live ?? 0} · 결제 대기 ${c.awaiting ?? 0}(기한 12시간 이내 ${c.pay_due_soon ?? 0}) · 미결제 뒤 판매자 선택 대기 ${c.seller_choice ?? 0} · 의심 표시 ${c.flagged ?? 0}`} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <FilterTabs base="/admin/auctions" param="tab" current={tab} keep={keep} options={TABS} />
        <form className="flex gap-1.5" action="/admin/auctions">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={q} placeholder="AU 번호·상품 제목" aria-label="경매 검색"
            className="h-8 w-52 rounded-md border border-[var(--a-border)] bg-white px-2 text-[12px]" />
          <button className="press rounded-md bg-tomo-navy/5 px-3 text-[12px] font-bold">검색</button>
        </form>
      </div>
      <Panel>
        {list.error ? <p className="a-faint p-4 text-[13px]">경매 목록을 읽지 못했어요: {list.error.message}</p> : (
          <Table head={["번호", "상품", "판매자", "상태", "현재가·낙찰가", "입찰", "마감·기한", "표시", ""]} empty="해당하는 경매가 없어요">
            {items.map((r) => {
              const ag = auctionAging(r, now);
              return (
                <tr key={r.id}>
                  <td className="tnum whitespace-nowrap font-semibold">{r.code}</td>
                  <td className="max-w-[240px]">
                    <Link href={`/listings/${r.listing_id}`} className="a-link flex items-center gap-2">
                      <Thumb src={r.image} /><span className="truncate">{r.title}</span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{r.seller.nickname ?? "—"}</td>
                  <td><Pill tone={TONE[r.status]}>{AUCTION_STATUS_LABEL[r.status] ?? r.status}</Pill></td>
                  <td className="tnum whitespace-nowrap">{money(r.final_price ?? r.current_price, r.currency)}
                    <span className="a-faint ml-1 text-[11px]">{r.status === "live" ? (r.leader_nickname ?? "입찰 없음") : (r.winner_nickname ?? "")}</span></td>
                  <td className="tnum whitespace-nowrap">{r.bid_count}회 · {r.bidder_count}명</td>
                  <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.status === "awaiting_payment" && r.pay_due_at ? r.pay_due_at : r.closed_at ?? r.ends_at)}
                    {r.extended_count > 0 && r.status === "live" && <span className="ml-1 text-[11px]">연장 {r.extended_count}</span>}</td>
                  <td className="whitespace-nowrap">
                    {ag && <Pill tone={ag.level === "late" ? "red" : "amber"}>{ag.text}</Pill>}
                    {r.flag_count > 0 && <Pill tone="red">의심 {r.flag_count}</Pill>}
                  </td>
                  <td className="text-right"><Link href={hrefWith("/admin/auctions", keep, { open: r.id })} scroll={false} className="a-link text-[12px]">열기</Link></td>
                </tr>
              );
            })}
          </Table>
        )}
        {total > items.length && <p className="a-faint px-3 py-2 text-[12px]">{total}건 중 {items.length}건. 번호로 검색하세요</p>}
      </Panel>
      {sp.open && (d ? <AuctionDetail d={d} closeHref={closeHref} now={now} /> : (
        <DetailSheet title="경매" closeHref={closeHref}><p className="a-muted">{detail?.error ? `읽지 못했어요: ${detail.error.message}` : "경매를 찾지 못했어요."}</p></DetailSheet>
      ))}
    </>
  );
}

function AuctionDetail({ d, closeHref, now }: { d: Detail; closeHref: string; now: number }) {
  const a = d.auction;
  const live = a.status === "live";
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--a-border)] py-1.5 last:border-b-0">
      <span className="a-muted shrink-0">{k}</span><span className="min-w-0 break-words text-right">{v}</span>
    </div>
  );
  const ag = auctionAging(a, now);
  return (
    <DetailSheet closeHref={closeHref} title={`${a.code} · ${d.listing?.title ?? ""}`}
      sub={<><Pill tone={TONE[a.status]}>{AUCTION_STATUS_LABEL[a.status] ?? a.status}</Pill>{ag && <span className="ml-1"><Pill tone={ag.level === "late" ? "red" : "amber"}>{ag.text}</Pill></span>}</>}>
      <section className="mb-4">
        {row("상품", d.listing ? <Link href={`/listings/${d.listing.id}`} className="a-link">{d.listing.title}</Link> : "—")}
        {row("판매자", `${d.seller?.nickname ?? "—"}${d.seller?.suspended ? " (정지)" : ""}`)}
        {row("시작가 · 현재가", `${money(a.start_price, a.currency)} · ${money(a.current_price, a.currency)}`)}
        {a.final_price != null && row("낙찰가 · 낙찰자", `${money(a.final_price, a.currency)} · ${d.winner_nickname ?? "—"}`)}
        {live && row("1등", d.leader_nickname ?? "입찰 없음")}
        {row("입찰", `${a.bid_count}회 · ${a.bidder_count}명`)}
        {row("마감", `${fmtDate(a.ends_at)}${a.extended_count ? ` (연장 ${a.extended_count}회, 처음 ${fmtDate(a.original_ends_at)})` : ""}`)}
        {a.pay_due_at && row("결제 기한", fmtDate(a.pay_due_at))}
        {a.tx_id && row("거래", <Link href={`/transactions/${a.tx_id}`} className="a-link">거래 열기</Link>)}
        {a.seller_choice_pending && row("판매자 선택", "아직 다시 경매·일반 전환을 고르지 않았어요")}
        {d.chain.length > 1 && row("같은 상품 경매", d.chain.map((x) => `${x.code}(${AUCTION_STATUS_LABEL[x.status as AuctionStatus] ?? x.status})`).join(" → "))}
      </section>

      {live && (
        <section className="mb-4 rounded-md border border-[var(--a-border)] p-3">
          <p className="mb-2 text-[12px] font-semibold">강제 종료</p>
          <p className="a-muted mb-2 text-[12px]">진행 중 경매는 상품 숨김·보류 대신 강제 종료로 끝내요. 입찰자 전원·판매자에게 알림이 가고, 판매자는 다시 경매나 일반 판매를 고를 수 있어요.</p>
          <AuctionActions kind="close" auctionId={a.id} code={a.code} bidders={a.bidder_count} />
        </section>
      )}

      <Panel title="입찰자" count={d.bidders.length} className="mb-4">
        <Table head={["입찰자", "상한", "표시", ""]} empty="입찰자가 없어요">
          {d.bidders.map((b) => (
            <tr key={b.bidder_id} className="align-top">
              <td className="whitespace-nowrap">
                <Link href={`/admin/users/${b.bidder_id}`} className="a-link">{b.nickname ?? "—"}</Link>
                {b.leading && <span className="ml-1"><Pill tone="blue">1등</Pill></span>}
                {b.voided && <span className="ml-1"><Pill tone="gray">무효</Pill></span>}
                <p className="a-faint text-[11px]">가입 {b.joined_at ? fmtDate(b.joined_at) : "—"}{b.active_strikes ? ` · 경고 ${b.active_strikes}` : ""}{b.suspended ? " · 정지" : ""}</p>
                {b.void_note && <p className="a-faint text-[11px]">무효 사유: {b.void_note}</p>}
              </td>
              <td className="tnum whitespace-nowrap">{a.max_visible ? (b.max_amount != null ? money(b.max_amount, a.currency) : "—") : <span className="a-faint text-[11px]">마감 뒤 공개</span>}</td>
              <td className="max-w-[180px] text-[11px]">{b.signals.length ? b.signals.map((s) => <p key={s} className="text-tomo-coral-deep">{flagText(s)}</p>) : <span className="a-faint">—</span>}</td>
              <td className="w-[170px] text-right">{live && !b.voided && <AuctionActions kind="void" auctionId={a.id} bidderId={b.bidder_id} nickname={b.nickname ?? "입찰자"} leading={b.leading} />}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      {d.strikes.length > 0 && (
        <Panel title="미결제 경고" count={d.strikes.length} className="mb-4">
          <Table head={["회원", "경매", "받은 때", ""]}>
            {d.strikes.map((s) => (
              <tr key={s.id} className="align-top">
                <td className="whitespace-nowrap">{s.nickname ?? "—"}</td>
                <td className="tnum">{s.auction_code ?? "—"}</td>
                <td className="a-faint tnum whitespace-nowrap">{fmtDate(s.created_at)}{s.lifted_at && <p>해제 {fmtDate(s.lifted_at)}{s.note ? ` · ${s.note}` : ""}</p>}</td>
                <td className="w-[170px] text-right">{!s.lifted_at && <AuctionActions kind="strike" strikeId={s.id} nickname={s.nickname ?? "회원"} />}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}

      <Panel title="입찰 기록(원본)" count={d.bids.length} className="mb-4">
        <Table head={["시각", "입찰자", "금액", "종류"]} empty="입찰 기록이 없어요">
          {d.bids.map((b) => (
            <tr key={b.id} className={b.voided_at ? "opacity-50" : undefined}>
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(b.at)}</td>
              <td className="whitespace-nowrap">{b.nickname ?? "—"}</td>
              <td className={`tnum whitespace-nowrap ${b.voided_at ? "line-through" : ""}`}>{money(b.amount, a.currency)}</td>
              <td className="whitespace-nowrap text-[12px]">{b.kind === "auto" ? "자동" : "직접"}{b.voided_at && " · 무효"}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      {d.actions.length > 0 && (
        <Panel title="운영 기록" count={d.actions.length}>
          <ul className="px-3 py-2 text-[12px]">
            {d.actions.map((x) => (
              <li key={x.id} className="border-b border-[var(--a-border)] py-1.5 last:border-b-0">
                <span className="a-faint tnum mr-1.5">{fmtDate(x.created_at)}</span><b>{ACTION[x.action] ?? x.action}</b> · {x.admin ?? "—"}
                {typeof x.detail.note === "string" && <span className="a-muted"> · {x.detail.note}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </DetailSheet>
  );
}
