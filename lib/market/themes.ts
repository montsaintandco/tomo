import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { TRENDING, type TrendingTheme } from "./trending-data";
import type { MarketSource } from "./types";

// 인기 큐레이션 — DB(trending_themes, 어드민이 편집) 우선, 실패·비어있음이면 코드 테이블 폴백.
// 공개 읽기 RLS라 익명 클라이언트로 충분 (unstable_cache 안에서는 쿠키 클라이언트를 쓸 수 없다)
async function loadThemes(country: "KR" | "JP"): Promise<TrendingTheme[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return TRENDING[country];
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.from("trending_themes")
    .select("key, label, label_ja, term, sources")
    .eq("country", country).eq("active", true).order("sort_order");
  if (error || !data || data.length === 0) return TRENDING[country];
  return data.map((r) => ({
    key: r.key, label: r.label, labelJa: r.label_ja, term: r.term,
    sources: r.sources as MarketSource[],
  }));
}

export const getThemes = (country: "KR" | "JP") =>
  unstable_cache(() => loadThemes(country), ["trending-themes", country], { revalidate: 600 })();
