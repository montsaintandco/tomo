import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/listings";
import { PageHeader, Panel, Table, Pill, Kpi, Avatar, fmtDate, money, TX_META, PROXY_META, ORDER_META } from "@/components/admin/ui";
import AdminToggle from "@/components/AdminToggle";
import LedgerAdjustForm from "@/components/admin/LedgerAdjustForm";
import { CountryChip } from "@/components/Brand";
import { rows, tableMissing } from "@/lib/safe";
import { ledgerBalances, signed, LEDGER_KIND_LABEL, PAYOUT_META, type LedgerKind, type PayoutStatus } from "@/lib/payouts";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type Profile = {
  id: string; nickname: string; country: "KR" | "JP"; region: string; language: string; trust_temp: number;
  is_admin: boolean; suspended: boolean; created_at: string;
};
type Tx = { id: string; status: string; item_price: number; currency: string; created_at: string; listings: { title: string } | null };
type Proxy = { id: string; status: string; quote_total: number | null; order_id: string | null; created_at: string; external_items: { title: string } | null };
type Order = { id: string; status: string; total: number; currency: string; created_at: string };
type Ticket = { id: string; category: string; status: string; body: string; created_at: string };
type Ledger = { id: number; currency: "KRW" | "JPY"; amount: number; kind: LedgerKind; memo: string; created_at: string };
type Payout = { id: string; currency: string; amount: number; status: PayoutStatus; bank_name: string; account_number: string; account_holder: string; admin_note: string; requested_at: string };
type Account = { currency: string; bank_name: string; account_number: string; account_holder: string };

const CAT: Record<string, string> = { before: "주문 전", after: "주문 후", sell: "판매", travel: "여행 직거래" };
const TICKET: Record<string, { label: string; tone: "red" | "green" | "gray" }> = {
  open: { label: "답변 필요", tone: "red" }, answered: { label: "답변함", tone: "green" }, closed: { label: "닫힘", tone: "gray" },
};
const LIMIT = 30;

// 회원 상세 — 프로필·거래(구매/판매)·대행·주문·문의·정산 잔액을 한 화면에
export default async function AdminUserDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect(`/login?next=/admin/users/${id}`);
  if (!viewer.isAdmin) redirect("/");

  const { data: p } = await supabase.from("profiles")
    .select("id, nickname, country, region, language, trust_temp, is_admin, suspended, created_at")
    .eq("id", id).maybeSingle<Profile>();
  if (!p) notFound();
  // 기본 배송지: 주소록(0028, 관리자 select 정책) → 없으면 옛 profiles.ship_*(0028 전에만 읽힌다)
  type Ship = { name: string; phone: string; postal: string; address: string };
  const addrRes = await supabase.from("addresses").select("name, phone, postal, address").eq("user_id", id).eq("is_default", true).maybeSingle<Ship>();
  const ship: Ship | null = !addrRes.error ? addrRes.data
    : await supabase.from("profiles").select("ship_name, ship_phone, ship_postal, ship_address").eq("id", id).maybeSingle()
        .then((r) => (r.data?.ship_name ? { name: r.data.ship_name, phone: r.data.ship_phone ?? "", postal: r.data.ship_postal ?? "", address: r.data.ship_address ?? "" } : null), () => null);

  const recent = { ascending: false } as const;
  const [buyRes, sellRes, proxyRes, orderRes, ticketRes, ledRes, payRes, accRes, email] = await Promise.all([
    supabase.from("transactions").select("id, status, item_price, currency, created_at, listings!transactions_listing_id_fkey(title)").eq("buyer_id", id).order("created_at", recent).limit(LIMIT),
    supabase.from("transactions").select("id, status, item_price, currency, created_at, listings!transactions_listing_id_fkey(title)").eq("seller_id", id).order("created_at", recent).limit(LIMIT),
    supabase.from("proxy_requests").select("id, status, quote_total, order_id, created_at, external_items(title)").eq("user_id", id).order("created_at", recent).limit(LIMIT),
    supabase.from("proxy_orders").select("id, status, total, currency, created_at").eq("user_id", id).order("created_at", recent).limit(LIMIT),
    supabase.from("support_tickets").select("id, category, status, body, created_at").eq("user_id", id).order("created_at", recent).limit(LIMIT),
    supabase.from("seller_ledger").select("id, currency, amount, kind, memo, created_at").eq("user_id", id).order("created_at", recent).limit(1000),
    supabase.from("payouts").select("id, currency, amount, status, bank_name, account_number, account_holder, admin_note, requested_at").eq("user_id", id).order("requested_at", recent).limit(LIMIT),
    supabase.from("payout_accounts").select("currency, bank_name, account_number, account_holder").eq("user_id", id),
    // 이메일은 auth 스키마 — service_role 키가 없으면 비운다
    (async () => { try { return (await createAdminSupabase().auth.admin.getUserById(id)).data.user?.email ?? null; } catch { return null; } })(),
  ]);
  const buys = rows(buyRes as unknown as { data: Tx[] | null; error: typeof buyRes.error });
  const sells = rows(sellRes as unknown as { data: Tx[] | null; error: typeof sellRes.error });
  const proxies = rows(proxyRes as unknown as { data: Proxy[] | null; error: typeof proxyRes.error });
  const orders = rows(orderRes as { data: Order[] | null; error: typeof orderRes.error });
  const tickets = rows(ticketRes as { data: Ticket[] | null; error: typeof ticketRes.error });
  const ledger = rows(ledRes as { data: Ledger[] | null; error: typeof ledRes.error });
  const payouts = rows(payRes as { data: Payout[] | null; error: typeof payRes.error });
  const accounts = rows(accRes as { data: Account[] | null; error: typeof accRes.error });
  const payoutMissing = tableMissing(ledRes.error) || tableMissing(payRes.error);
  const bal = ledgerBalances(ledger);
  const pending = (c: string) => payouts.filter((x) => x.status === "requested" && x.currency === c).reduce((s, x) => s + x.amount, 0);
  const myCur = p.country === "KR" ? "KRW" : "JPY";
  const more = (n: number) => (n >= LIMIT ? `${n}+` : n);

  return (
    <>
      <PageHeader title={p.nickname}
        sub={`가입 ${fmtDate(p.created_at)} · 온도 ${Number(p.trust_temp).toFixed(1)}° · ${p.language === "ja" ? "日本語" : "한국어"}`}
        actions={
          <>
            <Link href="/admin/users" className="a-muted text-[12px]">← 사용자</Link>
            <Link href={`/profile/${p.id}`} className="a-link text-[12px]">공개 프로필</Link>
            <AdminToggle label={p.suspended ? "정지 해제" : "정지"} danger={!p.suspended}
              confirmText={p.suspended ? undefined : `${p.nickname} 님을 정지할까요? 글쓰기가 막히고 판매중 상품이 숨겨져요.`}
              action={{ rpc: "admin_set_user", args: { p_id: p.id, p_suspended: !p.suspended, p_admin: p.is_admin } }} />
          </>
        } />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={`정산 잔액 ${myCur}`} value={payoutMissing ? "—" : money(bal[myCur], myCur)}
          sub={payoutMissing ? "마이그레이션 미적용" : `출금 신청 중 ${money(pending(myCur), myCur)}${ledger.length >= 1000 ? " · 원장 1000건 초과, 합계 부정확" : ""}`} />
        <Kpi label="구매 거래" value={more(buys.length)} />
        <Kpi label="판매 거래" value={more(sells.length)} />
        <Kpi label="답변 필요 문의" value={tickets.filter((x) => x.status === "open").length} alert />
      </div>

      <div className="mb-5 grid gap-5 md:grid-cols-2">
        <Panel title="프로필">
          <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 p-3 text-[13px]">
            <dt className="a-muted">회원</dt><dd className="flex items-center gap-2"><Avatar name={p.nickname} />{p.nickname}
              {p.is_admin && <Pill tone="navy">운영자</Pill>}{p.suspended && <Pill tone="red">정지</Pill>}</dd>
            <dt className="a-muted">ID</dt><dd className="tnum break-all text-[12px]">{p.id}</dd>
            <dt className="a-muted">이메일</dt><dd>{email ?? <span className="a-faint">— (service_role 키 필요)</span>}</dd>
            <dt className="a-muted">지역</dt><dd className="flex items-center gap-1"><CountryChip country={p.country} />{p.region}</dd>
            <dt className="a-muted">기본 배송지</dt>
            <dd>{ship ? `${ship.name} · ${ship.phone} · (${ship.postal}) ${ship.address}` : <span className="a-faint">—</span>}</dd>
          </dl>
        </Panel>
        <Panel title="정산">
          {payoutMissing ? <p className="a-muted p-3 text-[13px]">마이그레이션 미적용 (0026)</p> : (
            <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 p-3 text-[13px]">
              {(["KRW", "JPY"] as const).map((c) => (
                <span key={c} className="contents">
                  <dt className="a-muted">잔액 {c}</dt>
                  <dd className="tnum">{money(bal[c], c)} <span className="a-faint">· 신청 중 {money(pending(c), c)}</span></dd>
                </span>
              ))}
              <dt className="a-muted">계좌</dt>
              <dd>{accounts.length ? accounts.map((a) => <p key={a.currency}>{a.currency} · {a.bank_name} <span className="tnum">{a.account_number}</span> · {a.account_holder}</p>)
                : <span className="a-faint">미등록</span>}</dd>
            </dl>
          )}
        </Panel>
      </div>

      <TxPanel title="구매 거래" list={buys} />
      <TxPanel title="판매 거래" list={sells} />

      <Panel className="mb-5" title="구매대행 요청" count={proxies.length}>
        <Table head={["신청", "상품", "견적", "상태"]} empty="요청이 없어요">
          {proxies.map((r) => (
            <tr key={r.id}>
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.created_at)}</td>
              <td className="max-w-[320px] truncate"><Link href={`/proxy/${r.id}`} className="a-link">{r.external_items?.title ?? r.id.slice(0, 8)}</Link></td>
              <td className="tnum whitespace-nowrap">{r.quote_total != null ? money(r.quote_total, "JPY") : <span className="a-faint">—</span>}</td>
              <td><Pill tone={PROXY_META[r.status]?.tone}>{PROXY_META[r.status]?.label ?? r.status}</Pill></td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel className="mb-5" title="대행 주문" count={orders.length}>
        <Table head={["주문", "번호", "합계", "상태"]} empty="주문이 없어요">
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(o.created_at)}</td>
              <td><Link href={`/order/${o.id}`} className="a-link tnum">{o.id.slice(0, 8)}</Link></td>
              <td className="tnum whitespace-nowrap">{money(o.total, o.currency)}</td>
              <td><Pill tone={ORDER_META[o.status]?.tone}>{ORDER_META[o.status]?.label ?? o.status}</Pill></td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel className="mb-5" title="문의" count={tickets.length} actions={<Link href="/admin/support" className="a-link text-[12px]">문의 화면</Link>}>
        <Table head={["접수", "분류", "내용", "상태"]} empty="문의가 없어요">
          {tickets.map((x) => (
            <tr key={x.id}>
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(x.created_at)}</td>
              <td className="whitespace-nowrap">{CAT[x.category] ?? x.category}</td>
              <td className="a-muted max-w-[420px] truncate">{x.body}</td>
              <td><Pill tone={TICKET[x.status]?.tone}>{TICKET[x.status]?.label ?? x.status}</Pill></td>
            </tr>
          ))}
        </Table>
      </Panel>

      {!payoutMissing && (
        <>
          <Panel className="mb-5" title="출금 신청" count={payouts.length} actions={<Link href="/admin/payouts" className="a-link text-[12px]">출금 화면</Link>}>
            <Table head={["신청", "금액", "계좌", "상태", "메모"]} empty="출금 신청이 없어요">
              {payouts.map((x) => (
                <tr key={x.id}>
                  <td className="a-faint tnum whitespace-nowrap">{fmtDate(x.requested_at)}</td>
                  <td className="tnum whitespace-nowrap">{money(x.amount, x.currency)}</td>
                  <td className="whitespace-nowrap text-[12px]">{x.bank_name} <span className="tnum">{x.account_number}</span> · {x.account_holder}</td>
                  <td><Pill tone={PAYOUT_META[x.status].tone}>{PAYOUT_META[x.status].label}</Pill></td>
                  <td className="a-muted max-w-[220px] truncate text-[12px]">{x.admin_note || "—"}</td>
                </tr>
              ))}
            </Table>
          </Panel>

          <Panel title="판매자 원장" count={ledger.length}>
            <LedgerAdjustForm userId={p.id} defaultCurrency={myCur} />
            <Table head={["일시", "구분", "금액", "메모"]} empty="원장이 비어 있어요">
              {ledger.slice(0, 100).map((l) => (
                <tr key={l.id}>
                  <td className="a-faint tnum whitespace-nowrap">{fmtDate(l.created_at)}</td>
                  <td className="whitespace-nowrap">{LEDGER_KIND_LABEL[l.kind]}</td>
                  <td className={`tnum whitespace-nowrap ${l.amount < 0 ? "a-muted" : "font-semibold"}`}>{signed(l.amount, (n) => money(n, l.currency))}</td>
                  <td className="a-muted max-w-[320px] truncate text-[12px]">{l.memo || "—"}</td>
                </tr>
              ))}
            </Table>
          </Panel>
        </>
      )}
    </>
  );
}

function TxPanel({ title, list }: { title: string; list: Tx[] }) {
  return (
    <Panel className="mb-5" title={title} count={list.length}>
      <Table head={["생성", "상품", "금액", "상태"]} empty="거래가 없어요">
        {list.map((x) => (
          <tr key={x.id}>
            <td className="a-faint tnum whitespace-nowrap">{fmtDate(x.created_at)}</td>
            <td className="max-w-[320px] truncate"><Link href={`/transactions/${x.id}`} className="a-link">{x.listings?.title ?? x.id.slice(0, 8)}</Link></td>
            <td className="tnum whitespace-nowrap">{money(x.item_price, x.currency)}</td>
            <td><Pill tone={TX_META[x.status]?.tone}>{TX_META[x.status]?.label ?? x.status}</Pill></td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}
