import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestLang } from "./locale";

export type Viewer = {
  id: string; country: "KR" | "JP"; region: string;
  language: "ko" | "ja"; currency: "KRW" | "JPY"; rate: number; isAdmin: boolean;
};

// 게스트도 피드·상세를 볼 수 있게 하는 뷰어 대체값 (공개 브라우징)
export type ViewerOrGuest = (Viewer & { guest?: false }) | (Omit<Viewer, "id"> & { id: null; guest: true });

// 환율 2행 — 요청마다 DB를 부르지 않게 서버 메모리에 1분 둔다(서버 1대, 화면 표시용 값). 실패는 담지 않는다
const RATE_TTL = 60_000;
let rateMemo: { at: number; rows: { pair: string; rate: number }[] } | null = null;
async function exchangeRates(supabase: SupabaseClient): Promise<{ pair: string; rate: number }[]> {
  if (rateMemo && Date.now() - rateMemo.at < RATE_TTL) return rateMemo.rows;
  const { data, error } = await supabase.from("exchange_rates").select("pair, rate");
  if (error || !data?.length) return rateMemo?.rows ?? [];
  rateMemo = { at: Date.now(), rows: data };
  return data;
}

// 게스트는 요청 언어로 나라를 정한다 — 일본어 브라우저(또는 JP 토글)면 일본 사람 시점(엔화·한국 마켓 인기)
export async function getViewerOrGuest(supabase: SupabaseClient): Promise<ViewerOrGuest> {
  const viewer = await getViewer(supabase);
  if (viewer) return viewer;
  const language = await getRequestLang();
  const country = language === "ja" ? "JP" : "KR";
  const currency = country === "KR" ? "KRW" : "JPY";
  const pair = currency === "KRW" ? "JPY_KRW" : "KRW_JPY";
  const r = (await exchangeRates(supabase)).find((x) => x.pair === pair);
  return {
    id: null, guest: true, country, region: "", language,
    currency, rate: Number(r?.rate ?? (currency === "KRW" ? 9 : 0.11)), isAdmin: false,
  };
}

export async function getViewer(supabase: SupabaseClient): Promise<Viewer | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  // 프로필·환율(2행뿐)·요청 언어를 병렬로 — 직렬 3 RTT → 1 RTT
  const [{ data: p }, rates, reqLang] = await Promise.all([
    supabase.from("profiles").select("country, region, language, is_admin").eq("id", auth.user.id).single(),
    exchangeRates(supabase),
    getRequestLang(),
  ]);
  if (!p) return null;
  const currency = p.country === "KR" ? "KRW" : "JPY";
  const pair = currency === "KRW" ? "JPY_KRW" : "KRW_JPY";
  const r = rates?.find((x) => x.pair === pair);
  // 로그인 사용자도 토글로 UI 언어만 바꿀 수 있다 (나라·통화는 프로필)
  const language = reqLang === "ja" && p.language !== "ja" ? "ja" : p.language;
  return { id: auth.user.id, country: p.country, region: p.region, language, currency, rate: Number(r?.rate ?? 0), isAdmin: !!p.is_admin };
}

export function displayTitle(
  l: { title: string; source_language: string; listing_translations: { language: string; title: string }[] },
  viewerLanguage: string
): string {
  if (l.source_language === viewerLanguage) return l.title;
  return l.listing_translations.find((t) => t.language === viewerLanguage)?.title ?? l.title;
}
