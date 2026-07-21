import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const DEMO = [
  { email: "tomo.test.alice@gmail.com", items: [
    { title: "뉴진스 포카 일괄", description: "포토카드 5장 일괄 판매합니다", category: "kpop", price: 25000, currency: "KRW", country: "KR", region: "서울 마포구", lang: "ko", tTitle: "NewJeans トレカ まとめ売り", tDesc: "フォトカード5枚まとめて販売します", tLang: "ja" },
    { title: "필름카메라 니콘 FM2", description: "작동 완벽, 스크래치 약간", category: "camera", price: 350000, currency: "KRW", country: "KR", region: "서울 마포구", lang: "ko", tTitle: "フィルムカメラ Nikon FM2", tDesc: "動作完璧、小傷あり", tLang: "ja" },
  ]},
  { email: "tomo.test.bob@gmail.com", items: [
    { title: "ポケモンカード 旧裏 リザードン", description: "状態はプレイ用です", category: "game", price: 48000, currency: "JPY", country: "JP", region: "東京 新宿区", lang: "ja", tTitle: "포켓몬카드 구뒷면 리자몽", tDesc: "상태는 플레이용입니다", tLang: "ko" },
    { title: "無印良品 リュック 黒", description: "半年使用、美品", category: "fashion", price: 1800, currency: "JPY", country: "JP", region: "東京 新宿区", lang: "ja", tTitle: "무인양품 백팩 블랙", tDesc: "반년 사용, 상태 좋음", tLang: "ko" },
  ]},
];

async function main() {
  for (const u of DEMO) {
    const c = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: auth, error } = await c.auth.signInWithPassword({ email: u.email, password: "test-pass-1234" });
    if (error) throw error;
    for (const it of u.items) {
      const { data: existing } = await c.from("listings").select("id").eq("seller_id", auth.user!.id).eq("title", it.title).maybeSingle();
      if (existing) continue;
      const { data: l, error: le } = await c.from("listings").insert({
        seller_id: auth.user!.id, title: it.title, description: it.description,
        source_language: it.lang, price: it.price, currency: it.currency,
        category: it.category, trade_method: "both", cross_border_enabled: true,
        country: it.country, region: it.region,
      }).select("id").single();
      if (le) throw le;
      const { error: te } = await c.from("listing_translations").insert({
        listing_id: l!.id, language: it.tLang, title: it.tTitle, description: it.tDesc,
      });
      if (te) throw te;
      console.log("seeded:", it.title);
    }
  }
}
main();
