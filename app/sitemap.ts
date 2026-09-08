import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/site";

// 정적 페이지 + 판매중 상품. 외부 마켓 상품(/global/…)은 제외 — 스크랩 콘텐츠·항상 동적
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
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
