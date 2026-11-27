import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, FilterTabs, Pager, money } from "@/components/admin/ui";
import { hrefWith, likeEscape, pageOf } from "@/components/admin/paging";
import ListingsTable, { type AdminListingRow } from "@/components/admin/ListingsTable";
import DetailSheet from "@/components/admin/DetailSheet";
import ListingEditForm from "@/components/admin/ListingEditForm";
import Link from "next/link";

const FILTERS = [{ value: "", label: "전체" }, { value: "active", label: "판매중" }, { value: "hidden", label: "숨김" }, { value: "sold", label: "거래완료" }, { value: "held", label: "보류" }];
const UUID = /^[0-9a-f-]{36}$/;

// 상품 모더레이션 — 검색·필터·페이지 넘김(전부 URL), 숨김/복구(한 건·여러 건), 제목·가격 수정(?open= 시트, 0037)
export default async function AdminListingsPage(props: { searchParams: Promise<{ q?: string; f?: string; page?: string; open?: string }> }) {
  const sp = await props.searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const f = FILTERS.some((x) => x.value === sp.f) ? sp.f ?? "" : "";
  const { page, from, to, size } = pageOf(sp.page);
  const params = { q: q || undefined, f: f || undefined, page: page > 1 ? String(page) : undefined };
  const supabase = await createServerSupabase();
  let query = supabase.from("listings")
    .select("id, title, price, currency, status, country, region, images, hidden, hidden_by_admin, view_count, created_at, profiles!listings_seller_id_fkey(nickname)", { count: "exact" })
    .order("created_at", { ascending: false }).range(from, to);
  if (q) query = query.ilike("title", `%${likeEscape(q)}%`);
  if (f === "hidden") query = query.eq("hidden", true);
  else if (f === "held") query = query.eq("status", "held");
  else if (f) query = query.eq("status", f).eq("hidden", false);
  const { data, count } = await query;
  const raw = (data ?? []) as unknown as {
    id: string; title: string; price: number; currency: string; status: string; country: "KR" | "JP"; region: string;
    images: string[]; hidden: boolean; hidden_by_admin: boolean; view_count: number; created_at: string; profiles: { nickname: string } | null;
  }[];
  const rows: AdminListingRow[] = raw.map((l) => ({
    id: l.id, title: l.title, price: l.price, currency: l.currency, status: l.status, country: l.country, region: l.region,
    image: l.images?.[0] ?? null, hidden: l.hidden, hidden_by_admin: l.hidden_by_admin, view_count: l.view_count, created_at: l.created_at,
    seller: l.profiles?.nickname ?? null, editHref: hrefWith("/admin/listings", params, { open: l.id }),
  }));
  const openId = sp.open && UUID.test(sp.open) ? sp.open : null;

  return (
    <>
      <PageHeader title="상품" sub="숨김은 모든 피드·검색·상세에서 제외돼요. 운영 숨김은 판매자가 되살릴 수 없습니다. 보류는 발송 뒤 취소·분쟁 환불된 상품이에요. 반송을 확인한 뒤 「보류 해제」를 누르세요"
        actions={
          <form className="flex gap-2" role="search">
            {f && <input type="hidden" name="f" value={f} />}
            <input name="q" defaultValue={q} placeholder="제목 검색" aria-label="제목 검색" className="h-8 w-56 px-3 text-[13px]" />
            <button className="btn h-8 bg-tomo-navy px-3 text-[12px] text-white">검색</button>
          </form>
        } />
      <FilterTabs base="/admin/listings" param="f" options={FILTERS} current={f} keep={params} />
      <Panel>
        <ListingsTable rows={rows} />
        <Pager base="/admin/listings" params={params} page={page} size={size} total={count} shown={rows.length} />
      </Panel>
      {openId && <ListingSheet id={openId} closeHref={hrefWith("/admin/listings", params)} />}
    </>
  );
}

async function ListingSheet({ id, closeHref }: { id: string; closeHref: string }) {
  const supabase = await createServerSupabase();
  const [lRes, txRes] = await Promise.all([
    supabase.from("listings").select("id, title, price, currency, status, profiles!listings_seller_id_fkey(nickname)").eq("id", id).maybeSingle(),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("listing_id", id).not("status", "in", "(completed,cancelled)"),
  ]);
  const l = lRes.data as unknown as { id: string; title: string; price: number; currency: string; status: string; profiles: { nickname: string } | null } | null;
  if (!l) return <DetailSheet title="상품" closeHref={closeHref}><p className="a-muted">상품을 찾지 못했어요.</p></DetailSheet>;
  const locked = l.status === "reserved" || (txRes.count ?? 0) > 0;
  return (
    <DetailSheet closeHref={closeHref} title="상품 수정"
      sub={<>{l.profiles?.nickname} · 지금 {l.price === 0 ? "나눔" : money(l.price, l.currency)} · <Link href={`/listings/${l.id}`} className="a-link">고객 화면 ↗</Link></>}>
      <ListingEditForm id={l.id} title={l.title} price={l.price} currency={l.currency} priceLocked={locked} />
    </DetailSheet>
  );
}
