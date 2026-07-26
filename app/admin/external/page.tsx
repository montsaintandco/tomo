import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { formatPrice, type Currency } from "@/lib/currency";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";
import ExternalItemForm from "@/components/ExternalItemForm";
import Link from "next/link";
import { redirect } from "next/navigation";

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
    <main className="mx-auto max-w-md p-4 pb-24">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-tomo-navy">외부 상품 등록</h1>
        <Link href="/admin" className="text-xs text-gray-500">← 운영</Link>
      </div>
      <p className="mb-4 rounded-card bg-tomo-ivory p-3 text-xs text-gray-600">
        당근마켓·중고나라는 검색으로 자동 수집되지만, 수집이 안 되는 상품(비공개 링크, 특가 등)은
        여기서 직접 등록할 수 있어요. 등록하면 해외직구 피드에 노출되고 대행 신청을 받습니다.
      </p>

      <ExternalItemForm />

      <h2 className="mb-2 mt-6 text-sm font-bold text-gray-500">등록된 상품</h2>
      <div className="flex flex-col gap-2">
        {(items ?? []).map((it) => (
          <Link key={it.id} href={`/global/${it.source}/${it.source_id}`}
            className="flex items-center gap-3 rounded-card border bg-white p-3">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-card bg-gray-100">
              {(it.images as string[])?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={(it.images as string[])[0]} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{it.title}</p>
              <p className="text-xs text-gray-400">
                {SOURCE_LABEL[it.source as MarketSource]} · {it.status === "active" ? "노출중" : "숨김"}
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold text-tomo-navy">
              {formatPrice(it.price, it.currency as Currency)}
            </span>
          </Link>
        ))}
        {(items ?? []).length === 0 && (
          <p className="rounded-card bg-tomo-ivory p-3 text-center text-xs text-gray-400">등록된 상품이 없어요</p>
        )}
      </div>
    </main>
  );
}
