import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { formatPrice, type Currency } from "@/lib/currency";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";
import ExternalItemForm from "@/components/ExternalItemForm";
import AdminToggle from "@/components/AdminToggle";
import { TomoSymbol } from "@/components/Brand";
import Link from "next/link";
import { redirect } from "next/navigation";

// 운영자 화면은 한국어 고정. 토큰만 v2
export default async function AdminExternalPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/admin/external");
  if (!viewer.isAdmin) redirect("/");

  const { data: items } = await supabase.from("external_items")
    .select("id, source, source_id, title, price, currency, images, status")
    .in("source", ["daangn", "joongna"])
    .order("created_at", { ascending: false }).limit(30);

  return (
    <main className="mx-auto max-w-md p-4 pb-24 md:max-w-3xl md:px-6 md:pb-16 md:pt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[17px] font-extrabold leading-tight text-ink md:text-xl">외부 상품 등록</h1>
        <Link href="/admin" className="press text-[13px] font-bold text-tomo-navy">← 운영</Link>
      </div>
      <p className="mb-4 rounded-card bg-tomo-navy/5 p-3.5 text-[13px] leading-relaxed text-ink">
        당근마켓·중고나라는 검색으로 자동 수집되지만, 수집이 안 되는 상품(비공개 링크, 특가 등)은
        여기서 직접 등록할 수 있어요. 등록하면 해외직구 피드에 노출되고 대행 신청을 받습니다.
      </p>

      <ExternalItemForm />

      <h2 className="mb-2 mt-8 text-[15px] font-extrabold text-ink">등록된 상품</h2>
      <div className="flex flex-col gap-2">
        {(items ?? []).map((it) => (
          <div key={it.id} className="card flex flex-wrap items-center gap-3 p-3">
            <Link href={`/global/${it.source}/${it.source_id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-thumb bg-tomo-navy/5">
                {(it.images as string[])?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={(it.images as string[])[0]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center"><TomoSymbol className="h-5 w-8 opacity-60" /></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">{it.title}</p>
                <p className="text-[12px] text-ink-soft">
                  {SOURCE_LABEL[it.source as MarketSource]} · {it.status === "active" ? "노출중" : it.status === "sold" ? "품절" : "숨김"}
                </p>
              </div>
              <span className="tnum shrink-0 text-[13px] font-extrabold text-ink">
                {formatPrice(it.price, it.currency as Currency)}
              </span>
            </Link>
            <span className="flex shrink-0 gap-1.5">
              <AdminToggle label={it.status === "active" ? "숨김" : "노출"}
                action={{ table: "external_items", id: it.id, update: { status: it.status === "active" ? "stale" : "active" } }} />
              <AdminToggle label="삭제" danger confirmText="이 외부 상품을 삭제할까요? 대행 신청이 걸려 있으면 삭제되지 않아요."
                action={{ table: "external_items", id: it.id, del: true }} />
            </span>
          </div>
        ))}
        {(items ?? []).length === 0 && (
          <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">등록된 상품이 없어요</p>
        )}
      </div>
    </main>
  );
}
