import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, Thumb, fmtDate, money } from "@/components/admin/ui";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";
import ExternalItemForm from "@/components/ExternalItemForm";
import AdminToggle from "@/components/AdminToggle";
import Link from "next/link";

// 외부 상품 캐시 — 파서가 채운 것 + 수동 등록(당근·중고나라). 숨김/노출·삭제
export default async function AdminExternalPage() {
  const supabase = await createServerSupabase();
  const { data: items } = await supabase.from("external_items")
    .select("id, source, source_id, title, price, currency, images, status, fetched_at")
    .order("fetched_at", { ascending: false }).limit(100);
  const rows = (items ?? []) as { id: string; source: string; source_id: string; title: string; price: number; currency: string; images: string[]; status: string; fetched_at: string }[];

  return (
    <>
      <PageHeader title="외부 상품" sub="최근 조회순 100건. 대행 신청이 걸린 상품은 삭제되지 않아요" />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel>
          <Table head={["상품", "소스", "가격", "상태", "조회", ""]} empty="캐시된 외부 상품이 없어요">
            {rows.map((it) => (
              <tr key={it.id}>
                <td>
                  <span className="flex items-center gap-2">
                    <Thumb src={it.images?.[0]} />
                    <Link href={`/global/${it.source}/${it.source_id}`} className="a-link block max-w-[260px] truncate">{it.title}</Link>
                  </span>
                </td>
                <td className="whitespace-nowrap">{SOURCE_LABEL[it.source as MarketSource]}</td>
                <td className="tnum whitespace-nowrap">{money(it.price, it.currency)}</td>
                <td><Pill tone={it.status === "active" ? "green" : it.status === "sold" ? "gray" : "amber"}>{it.status === "active" ? "노출" : it.status === "sold" ? "품절" : "숨김"}</Pill></td>
                <td className="a-faint tnum whitespace-nowrap">{fmtDate(it.fetched_at)}</td>
                <td className="text-right">
                  <span className="flex justify-end gap-1">
                    <AdminToggle label={it.status === "active" ? "숨김" : "노출"} action={{ table: "external_items", id: it.id, update: { status: it.status === "active" ? "stale" : "active" } }} />
                    <AdminToggle label="삭제" danger confirmText="이 외부 상품을 삭제할까요?" action={{ table: "external_items", id: it.id, del: true }} />
                  </span>
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel title="수동 등록" className="h-fit">
          <div className="p-3"><ExternalItemForm /></div>
        </Panel>
      </div>
    </>
  );
}
