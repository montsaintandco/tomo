import type { SupabaseClient } from "@supabase/supabase-js";

export type Viewer = {
  id: string; country: "KR" | "JP"; region: string;
  language: "ko" | "ja"; currency: "KRW" | "JPY"; rate: number; isAdmin: boolean;
};

// 게스트도 피드·상세를 볼 수 있게 하는 뷰어 대체값 (공개 브라우징)
export type ViewerOrGuest = (Viewer & { guest?: false }) | (Omit<Viewer, "id"> & { id: null; guest: true });

export async function getViewerOrGuest(supabase: SupabaseClient): Promise<ViewerOrGuest> {
  const viewer = await getViewer(supabase);
  if (viewer) return viewer;
  const { data: r } = await supabase.from("exchange_rates").select("rate").eq("pair", "JPY_KRW").single();
  return {
    id: null, guest: true, country: "KR", region: "", language: "ko",
    currency: "KRW", rate: Number(r?.rate ?? 9), isAdmin: false,
  };
}

export async function getViewer(supabase: SupabaseClient): Promise<Viewer | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: p } = await supabase.from("profiles")
    .select("country, region, language, is_admin").eq("id", auth.user.id).single();
  if (!p) return null;
  const currency = p.country === "KR" ? "KRW" : "JPY";
  const pair = currency === "KRW" ? "JPY_KRW" : "KRW_JPY";
  const { data: r } = await supabase.from("exchange_rates").select("rate").eq("pair", pair).single();
  return { id: auth.user.id, country: p.country, region: p.region, language: p.language, currency, rate: Number(r?.rate ?? 0), isAdmin: !!p.is_admin };
}

export function displayTitle(
  l: { title: string; source_language: string; listing_translations: { language: string; title: string }[] },
  viewerLanguage: string
): string {
  if (l.source_language === viewerLanguage) return l.title;
  return l.listing_translations.find((t) => t.language === viewerLanguage)?.title ?? l.title;
}
