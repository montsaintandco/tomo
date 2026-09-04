import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import { parseMarketUrl } from "@/lib/market/url";
import { loadItem } from "@/lib/market/item";
import { SOURCE_CURRENCY } from "@/lib/market/types";
import { t } from "@/lib/i18n";
import SellForm, { type SellPrefill } from "@/components/SellForm";

export const metadata = { title: "판매하기 · 出品する | TOMO" };

// ?hint= : 홈 "상대국이 찾는 것" 칩에서 제목 프리필
// ?from= : 크로스리스팅 — 메루카리·야후옥션·당근·중고나라 내 상품 링크를 파서로 읽어 폼을 채운다 (공급 확보의 핵심)
export default async function SellPage(props: { searchParams: Promise<{ hint?: string; from?: string }> }) {
  const { hint, from } = await props.searchParams;
  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);
  const lang = viewer.language;

  let prefill: SellPrefill | undefined;
  let importMsg: string | undefined;
  if (from) {
    const target = parseMarketUrl(from.trim());
    const item = target ? await loadItem(target.source, target.id) : null;
    if (item) {
      const sameCurrency = SOURCE_CURRENCY[target!.source] === viewer.currency;
      prefill = {
        title: item.title.slice(0, 80),
        description: (item.description || item.title).slice(0, 2000),
        price: sameCurrency && item.price > 0 ? Math.round(item.price) : undefined,
        images: (item.images.length ? item.images : [item.thumb]).filter(Boolean).slice(0, 5),
      };
      importMsg = sameCurrency ? t(lang, "sell.imported") : `${t(lang, "sell.imported")} · ${t(lang, "sell.importCurrency")}`;
    } else {
      importMsg = t(lang, "sell.importFail");
    }
  }
  return <SellForm lang={lang} hint={hint?.slice(0, 80) ?? ""} prefill={prefill} importMsg={importMsg} />;
}
