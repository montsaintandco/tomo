import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { t } from "@/lib/i18n";
import { PageTitle, Empty } from "@/components/mypage/MyNav";
import AddressBook, { type Addr } from "@/components/AddressBook";
import { tableMissing } from "@/lib/safe";
import { redirect } from "next/navigation";

export const metadata = { title: "배송지 · お届け先", robots: { index: false } };

// 배송지 — 주소록(0028). 테이블이 없으면 안내만(주문서는 기존 profiles.ship_* 프리필로 동작)
export default async function MyAddresses() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage/addresses");
  const lang = viewer.language;
  const { data, error } = await supabase.from("addresses").select("id, label, name, phone, postal, address, note, pccc, is_default")
    .eq("user_id", viewer.id).order("is_default", { ascending: false }).order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-none md:p-0 md:pb-16">
      <PageTitle>{t(lang, "my.nav.addresses")}</PageTitle>
      {error
        ? <Empty text={t(lang, tableMissing(error) ? "addr.unavailable" : "addr.fail")} />
        : <AddressBook lang={lang} initial={(data ?? []) as Addr[]} showPccc={viewer.country === "KR"} />}
    </main>
  );
}
