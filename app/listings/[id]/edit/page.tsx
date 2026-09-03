import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import SellForm, { type SellInitial } from "@/components/SellForm";
import { notFound, redirect } from "next/navigation";

export const metadata = { title: "상품 수정 · 商品を編集 | TOMO" };

export default async function EditListingPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect(`/login?next=/listings/${id}/edit`);
  const { data: l } = await supabase.from("listings")
    .select("id, seller_id, title, description, price, category, trade_method, cross_border_enabled, condition, shipping_payer, ship_days, allow_offers")
    .eq("id", id).maybeSingle();
  if (!l || l.seller_id !== viewer.id) notFound();
  return <SellForm lang={viewer.language} hint="" initial={l as SellInitial} />;
}
