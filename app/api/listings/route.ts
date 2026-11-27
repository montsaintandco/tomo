import { NextResponse } from "next/server";
import { pingIndexNow } from "@/lib/indexnow";
import { createServerSupabase } from "@/lib/supabase/server";
import { translateListing } from "@/lib/translate";
import { allow } from "@/lib/ratelimit";
import { isListingCategory } from "@/lib/categories";
import { auctionEnabled } from "@/lib/auction";

const METHODS = ["direct","shipping","both"];
const CONDITIONS = ["new","like_new","good","fair","poor"];
const PAYERS = ["seller","buyer"];
const SHIP_DAYS = ["1_2","2_3","4_7"];

const imageOk = (s: unknown): s is string => typeof s === "string" && s.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listing-images/`); // 외부 픽셀·이미지 바꿔치기 차단

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!allow(`listings:${auth.user.id}`, 20)) return NextResponse.json({ error: "too many requests" }, { status: 429 });

  const { data: profile } = await supabase.from("profiles")
    .select("country, region, language").eq("id", auth.user.id).single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });

  const body = await req.json();
  const { title, description, price, category, tradeMethod, crossBorder, images,
    condition = "good", shippingPayer = "seller", shipDays = "2_3", allowOffers = true } = body;
  // 경매 등록 1단계(U3): 숨긴 일반 상품(택배·제안 끔)으로 만든다. 공개는 POST /api/auctions(create_auction)가 한다
  const forAuction = auctionEnabled() && body.saleType === "auction";
  if (forAuction && (price <= 0 || tradeMethod !== "shipping")) return NextResponse.json({ error: "invalid fields" }, { status: 400 });
  // price 0 = 나눔
  if (!title || typeof title !== "string" || title.length > 80 ||
      !description || typeof description !== "string" || description.length > 2000 ||
      !Number.isInteger(price) || price < 0 || price > 100000000)
    return NextResponse.json({ error: "invalid fields" }, { status: 400 });
  if (!isListingCategory(category) || !METHODS.includes(tradeMethod))
    return NextResponse.json({ error: "invalid category or method" }, { status: 400 });
  if (!CONDITIONS.includes(condition) || !PAYERS.includes(shippingPayer) || !SHIP_DAYS.includes(shipDays))
    return NextResponse.json({ error: "invalid condition or shipping" }, { status: 400 });

  const { data: listing, error } = await supabase.from("listings").insert({
    seller_id: auth.user.id,
    title, description,
    source_language: profile.language,
    price,
    currency: profile.country === "KR" ? "KRW" : "JPY",
    category,
    trade_method: tradeMethod,
    cross_border_enabled: !!crossBorder,
    country: profile.country,
    region: profile.region,
    images: Array.isArray(images) ? images.filter(imageOk).slice(0, 5) : [],
    condition, shipping_payer: shippingPayer, ship_days: shipDays,
    allow_offers: !forAuction && price > 0 && !!allowOffers,   // 나눔·경매엔 가격제안 없음
    ...(forAuction ? { hidden: true } : {}),
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const translated = await translateListing({
    title, description, from: profile.language as "ko" | "ja",
  });
  if (translated) {
    await supabase.from("listing_translations").insert({
      listing_id: listing.id,
      language: profile.language === "ko" ? "ja" : "ko",
      title: translated.title,
      description: translated.description,
    });
  }
  if (!forAuction) void pingIndexNow([`/listings/${listing.id}`, "/sitemap.xml"]); // 네이버·빙 즉시 색인 (실패 무시). 경매는 숨긴 채라 나중에
  return NextResponse.json({ id: listing.id }, { status: 201 });
}
