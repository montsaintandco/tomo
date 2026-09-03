import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { formatPrice, type Currency } from "@/lib/currency";
import AdminToggle from "@/components/AdminToggle";
import { CountryChip, TomoSymbol } from "@/components/Brand";
import Link from "next/link";
import { redirect } from "next/navigation";

// 상품 모더레이션 — 숨김/복구. 운영자는 RLS로 숨긴 상품도 본다
export default async function AdminListingsPage(props: { searchParams: Promise<{ q?: string; hidden?: string }> }) {
  const { q, hidden } = await props.searchParams;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/admin/listings");
  if (!viewer.isAdmin) redirect("/");

  let query = supabase.from("listings")
    .select("id, title, price, currency, status, country, images, hidden, hidden_by_admin, view_count, created_at, profiles!listings_seller_id_fkey(nickname)")
    .order("created_at", { ascending: false }).limit(60);
  if (q) query = query.ilike("title", `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`);
  if (hidden === "1") query = query.eq("hidden", true);
  const { data } = await query;
  const rows = (data ?? []) as unknown as {
    id: string; title: string; price: number; currency: string; status: string; country: "KR" | "JP";
    images: string[]; hidden: boolean; hidden_by_admin: boolean; view_count: number; created_at: string;
    profiles: { nickname: string } | null;
  }[];

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-3xl md:px-6 md:pb-16 md:pt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[17px] font-extrabold leading-tight text-ink md:text-xl">상품 관리</h1>
        <Link href="/admin" className="press text-[13px] font-bold text-tomo-navy">← 운영</Link>
      </div>
      <form className="mb-3 flex gap-2" role="search">
        <input name="q" defaultValue={q ?? ""} placeholder="제목 검색" className="min-w-0 flex-1 rounded-full bg-tomo-ivory px-4 py-2.5 text-base placeholder:text-ink-soft" />
        <label className="flex items-center gap-1.5 text-[12px] font-bold text-ink"><input type="checkbox" name="hidden" value="1" defaultChecked={hidden === "1"} className="accent-[#C14E4C]" />숨김만</label>
        <button className="btn bg-tomo-navy px-4 py-2 text-sm text-white">검색</button>
      </form>

      <div className="flex flex-col gap-2">
        {rows.map((l) => (
          <div key={l.id} className="card flex items-center gap-3 p-3">
            <Link href={`/listings/${l.id}`} className="h-11 w-11 shrink-0 overflow-hidden rounded-thumb bg-tomo-navy/5">
              {l.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.images[0]} alt="" className="h-full w-full object-cover" />
              ) : <div className="flex h-full w-full items-center justify-center"><TomoSymbol className="h-5 w-8 opacity-60" /></div>}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/listings/${l.id}`} className="block truncate text-[13px] text-ink">{l.title}</Link>
              <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-soft">
                <CountryChip country={l.country} />
                <span>{l.profiles?.nickname}</span>
                <span className="tnum">· {formatPrice(l.price, l.currency as Currency)} · {l.status} · 조회 {l.view_count}</span>
                {l.hidden && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${l.hidden_by_admin ? "bg-tomo-coral-deep text-white" : "bg-tomo-navy/10 text-tomo-navy"}`}>{l.hidden_by_admin ? "운영 숨김" : "셀러 숨김"}</span>}
              </p>
            </div>
            <AdminToggle label={l.hidden_by_admin ? "복구" : "숨김"} danger={!l.hidden_by_admin}
              action={{ rpc: "admin_set_listing_hidden", args: { p_id: l.id, p_hidden: !l.hidden_by_admin } }} />
          </div>
        ))}
        {rows.length === 0 && <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">상품이 없어요</p>}
      </div>
    </main>
  );
}
