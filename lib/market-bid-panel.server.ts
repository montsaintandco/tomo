import type { SupabaseClient } from "@supabase/supabase-js";
import type { ViewerOrGuest } from "./listings";
import type { Addr } from "@/components/AddressBook";
import type { MbPanelProps } from "@/components/market-bid/MarketBidPanel";

// 상품 상세의 입찰 신청 패널 자료(M4). 설정·환율은 누구나 읽는 표(0050 settings 공개, exchange_rates).
// 내 진행 중 신청(본인 RLS, 결제창 대기는 빼고 — 다시 신청하면 DB 가 앞 대기를 만료시킨다)이 있으면 패널 대신 그 신청으로 보낸다. 조회 실패는 패널이 「지금은 받지 않아요」로 닫힌다
const OPEN = ["authorized", "placed", "outbid", "hold", "won", "capture_failed"];
export async function loadMbPanel(supabase: SupabaseClient, viewer: ViewerOrGuest, sourceId: string):
  Promise<Pick<MbPanelProps, "rate" | "settings" | "addresses" | "mine">> {
  const [set, rate, addr, mine] = await Promise.all([
    supabase.from("market_bid_settings").select("accepting, cap_max_jpy, min_lead_minutes, max_lead_hours, fee_jpy").maybeSingle(),
    supabase.from("exchange_rates").select("rate").eq("pair", "JPY_KRW").maybeSingle(),
    viewer.id ? supabase.from("addresses").select("id, label, name, phone, postal, address, note, pccc, is_default")
      .eq("user_id", viewer.id).order("is_default", { ascending: false }) : Promise.resolve({ data: [] }),
    viewer.id ? supabase.from("market_bids").select("id").eq("user_id", viewer.id).eq("source", "mercari").eq("source_id", sourceId)
      .in("status", OPEN).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    settings: set.data ?? null,
    rate: Number(rate.data?.rate) > 0 ? Number(rate.data!.rate) : null,
    addresses: ((addr.data ?? []) as Addr[]),
    mine: (mine.data as { id: string } | null) ?? null,
  };
}
