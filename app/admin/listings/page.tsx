import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, FilterTabs, Thumb, fmtDate, money } from "@/components/admin/ui";
import AdminToggle from "@/components/AdminToggle";
import { CountryChip } from "@/components/Brand";
import Link from "next/link";

const FILTERS = [{ value: "", label: "전체" }, { value: "active", label: "판매중" }, { value: "hidden", label: "숨김" }, { value: "sold", label: "거래완료" }];
const STATUS: Record<string, { label: string; tone: "green" | "amber" | "gray" }> = {
  active: { label: "판매중", tone: "green" }, reserved: { label: "예약중", tone: "amber" }, sold: { label: "거래완료", tone: "gray" },
};

// 상품 모더레이션 — 검색·필터·숨김/복구. 운영자는 RLS로 숨긴 상품도 본다
export default async function AdminListingsPage(props: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q, f = "" } = await props.searchParams;
  const supabase = await createServerSupabase();
  let query = supabase.from("listings")
    .select("id, title, price, currency, status, country, region, images, hidden, hidden_by_admin, view_count, created_at, profiles!listings_seller_id_fkey(nickname)")
    .order("created_at", { ascending: false }).limit(100);
  if (q) query = query.ilike("title", `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`);
  if (f === "hidden") query = query.eq("hidden", true);
  else if (f) query = query.eq("status", f).eq("hidden", false);
  const { data } = await query;
  const rows = (data ?? []) as unknown as {
    id: string; title: string; price: number; currency: string; status: string; country: "KR" | "JP"; region: string;
    images: string[]; hidden: boolean; hidden_by_admin: boolean; view_count: number; created_at: string; profiles: { nickname: string } | null;
  }[];

  return (
    <>
      <PageHeader title="상품" sub="숨김은 모든 피드·검색·상세에서 제외돼요. 운영 숨김은 판매자가 되살릴 수 없습니다"
        actions={
          <form className="flex gap-2" role="search">
            {f && <input type="hidden" name="f" value={f} />}
            <input name="q" defaultValue={q ?? ""} placeholder="제목 검색" className="h-8 w-56 px-3 text-[13px]" />
            <button className="btn h-8 bg-tomo-navy px-3 text-[12px] text-white">검색</button>
          </form>
        } />
      <FilterTabs base={q ? `/admin/listings?q=${encodeURIComponent(q)}&` : "/admin/listings"} param="f" options={FILTERS} current={f} />
      <Panel>
        <Table head={["상품", "판매자", "가격", "상태", "조회", "등록", ""]} empty="상품이 없어요">
          {rows.map((l) => (
            <tr key={l.id}>
              <td>
                <span className="flex items-center gap-2">
                  <Thumb src={l.images?.[0]} />
                  <span className="min-w-0">
                    <Link href={`/listings/${l.id}`} className="a-link block max-w-[260px] truncate">{l.title}</Link>
                    <span className="a-muted flex items-center gap-1 text-[12px]"><CountryChip country={l.country} />{l.region}</span>
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap">{l.profiles?.nickname}</td>
              <td className="tnum whitespace-nowrap">{l.price === 0 ? "나눔" : money(l.price, l.currency)}</td>
              <td>
                <span className="flex flex-wrap gap-1">
                  <Pill tone={STATUS[l.status]?.tone}>{STATUS[l.status]?.label ?? l.status}</Pill>
                  {l.hidden && <Pill tone={l.hidden_by_admin ? "red" : "gray"}>{l.hidden_by_admin ? "운영 숨김" : "셀러 숨김"}</Pill>}
                </span>
              </td>
              <td className="tnum">{l.view_count}</td>
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(l.created_at)}</td>
              <td className="text-right">
                <AdminToggle label={l.hidden_by_admin ? "복구" : "숨김"} danger={!l.hidden_by_admin}
                  action={{ rpc: "admin_set_listing_hidden", args: { p_id: l.id, p_hidden: !l.hidden_by_admin } }} />
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
