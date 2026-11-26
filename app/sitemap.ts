import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "../lib/site";

// 정적 페이지 + 판매중 상품. 외부 마켓 상품(/global/…)은 제외 — 스크랩 콘텐츠·항상 동적
export const revalidate = 3600;

// lastmod 를 요청마다 지금 시각으로 주면 검색엔진이 lastmod 를 믿지 않는다(키라팝 2026-10-26 서치콘솔 '발견됨 - 색인 안 됨').
// 정적 페이지는 내용을 실제로 고친 날을 준다 — 페이지를 손보면 이 날짜를 올린다. 상품은 끌올·등록 시각.
const PAGES_UPDATED = new Date("2026-11-26T00:00:00+09:00"); // T9: 고객센터 FAQ 위치·안내 문구

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = PAGES_UPDATED;
  // 정적 페이지는 ko(기본)·ja(?lang=ja) 두 변형 — hreflang과 동일 (lib/seo.ts)
  const withJa = (u: string) => ({ alternates: { languages: { ko: u, ja: `${u}?lang=ja`, "x-default": u } } });
  const statics: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1, ...withJa(`${SITE_URL}/`) },
    { url: `${SITE_URL}/global`, lastModified: now, changeFrequency: "daily", priority: 0.8, ...withJa(`${SITE_URL}/global`) },
    { url: `${SITE_URL}/guide`, lastModified: now, changeFrequency: "monthly", priority: 0.8, ...withJa(`${SITE_URL}/guide`) },
    { url: `${SITE_URL}/travel`, lastModified: now, changeFrequency: "daily", priority: 0.6, ...withJa(`${SITE_URL}/travel`) },
    { url: `${SITE_URL}/categories`, lastModified: now, changeFrequency: "weekly", priority: 0.5, ...withJa(`${SITE_URL}/categories`) },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5, ...withJa(`${SITE_URL}/about`) },
    { url: `${SITE_URL}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.4, ...withJa(`${SITE_URL}/help`) },
    { url: `${SITE_URL}/notice`, lastModified: now, changeFrequency: "weekly", priority: 0.3, ...withJa(`${SITE_URL}/notice`) },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.1, ...withJa(`${SITE_URL}/terms`) },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.1, ...withJa(`${SITE_URL}/privacy`) },
    { url: `${SITE_URL}/refund`, lastModified: now, changeFrequency: "yearly", priority: 0.1, ...withJa(`${SITE_URL}/refund`) },
  ];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return statics;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await supabase.from("listings").select("id, bumped_at, created_at").eq("status", "active").eq("hidden", false)
    .order("bumped_at", { ascending: false }).limit(5000);
  const listings: MetadataRoute.Sitemap = (data ?? []).map((l) => ({
    url: `${SITE_URL}/listings/${l.id}`, lastModified: new Date(l.bumped_at ?? l.created_at), changeFrequency: "daily", priority: 0.7,
  }));
  return [...statics, ...listings];
}
