import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { translateListing } from "@/lib/translate";

const CATEGORIES = ["figure","camera","fashion","kpop","game","vintage","etc"];
const METHODS = ["direct","shipping","both"];

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles")
    .select("country, region, language").eq("id", auth.user.id).single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 400 });

  const body = await req.json();
  const { title, description, price, category, tradeMethod, crossBorder, images } = body;
  if (!title || !description || !Number.isInteger(price) || price <= 0)
    return NextResponse.json({ error: "invalid fields" }, { status: 400 });
  if (!CATEGORIES.includes(category) || !METHODS.includes(tradeMethod))
    return NextResponse.json({ error: "invalid category or method" }, { status: 400 });

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
    images: Array.isArray(images) ? images.slice(0, 5) : [],
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
  return NextResponse.json({ id: listing.id }, { status: 201 });
}
