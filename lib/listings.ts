import type { SupabaseClient } from "@supabase/supabase-js";

export type Viewer = {
  id: string; country: "KR" | "JP"; region: string;
  language: "ko" | "ja"; currency: "KRW" | "JPY"; rate: number;
};

export async function getViewer(supabase: SupabaseClient): Promise<Viewer | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: p } = await supabase.from("profiles")
    .select("country, region, language").eq("id", auth.user.id).single();
  if (!p) return null;
  const currency = p.country === "KR" ? "KRW" : "JPY";
  const pair = currency === "KRW" ? "JPY_KRW" : "KRW_JPY";
  const { data: r } = await supabase.from("exchange_rates").select("rate").eq("pair", pair).single();
  return { id: auth.user.id, country: p.country, region: p.region, language: p.language, currency, rate: Number(r?.rate ?? 0) };
}

export function displayTitle(
  l: { title: string; source_language: string; listing_translations: { language: string; title: string }[] },
  viewerLanguage: string
): string {
  if (l.source_language === viewerLanguage) return l.title;
  return l.listing_translations.find((t) => t.language === viewerLanguage)?.title ?? l.title;
}
