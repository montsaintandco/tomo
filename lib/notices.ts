// 공지사항 — 정본은 notices 표(0029, 어드민 /admin/notices). 아래 NOTICES 는 표가 없거나·DB 오류·0건일 때의 폴백.
import type { SupabaseClient } from "@supabase/supabase-js";
import { rows } from "./safe";

export type Notice = { id?: string; date: string; pinned?: boolean; title: { ko: string; ja: string }; body: { ko: string; ja: string } };
export type NoticeRow = {
  id: string; published_on: string; title_ko: string; title_ja: string; body_ko: string; body_ja: string;
  pinned: boolean; is_published: boolean; created_at: string; updated_at: string;
};
export const NOTICE_COLS = "id, published_on, title_ko, title_ja, body_ko, body_ja, pinned, is_published, created_at, updated_at";

/** /notice 목록 — 게시된 행(고정 먼저, 최신 먼저). 0건·오류면 코드 목록 */
export async function loadNotices(supabase: SupabaseClient): Promise<Notice[]> {
  try {
    const res = await supabase.from("notices").select(NOTICE_COLS).eq("is_published", true)
      .order("pinned", { ascending: false }).order("published_on", { ascending: false }).order("created_at", { ascending: false })
      .limit(100).abortSignal(AbortSignal.timeout(3000));
    const list = rows(res as unknown as { data: NoticeRow[] | null; error: { code?: string } | null });
    if (list.length === 0) return NOTICES;
    return list.map((r) => ({ id: r.id, date: r.published_on, pinned: r.pinned, title: { ko: r.title_ko, ja: r.title_ja }, body: { ko: r.body_ko, ja: r.body_ja } }));
  } catch {
    return NOTICES;
  }
}

// 폴백 — 최신이 위. 사실만 적는다 (배포된 기능 기준). 0029 시드와 같은 내용

export const NOTICES: Notice[] = [
  {
    date: "2026-09-04",
    title: { ko: "장바구니·1회 결제 도입", ja: "カート・1回決済を導入" },
    body: {
      ko: "해외 마켓 상품을 장바구니에 담아 한 번에 주문할 수 있어요. 상품 가격·국제 배송비·통관·대행 수수료를 합한 금액을 주문 시 1회 결제하며, 2차 결제는 없습니다.\n거주 국가는 마이페이지 → 프로필 편집에서 바꿀 수 있어요.",
      ja: "海外マーケットの商品をカートに入れてまとめて注文できます。商品価格・国際配送費・通関・代行手数料を合わせた金額を注文時に1回決済し、追加請求はありません。\n居住国はマイページ → プロフィール編集で変更できます。",
    },
  },
];
