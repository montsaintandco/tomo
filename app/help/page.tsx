import Link from "next/link";
import { getRequestLang } from "@/lib/locale";
import { PROXY_SERVICE_RATE } from "@/lib/fees";

export const metadata = { title: "고객센터 · サポート | TOMO" };

// 고객센터 — 사줘의 "고객센터"에 해당. FAQ는 네이티브 <details>, 문의는 채팅. 운영시간 등 미확정 정보는 적지 않는다
const C = {
  ko: {
    h1: "고객센터", sub: "자주 묻는 질문을 먼저 확인해 주세요. 해결되지 않으면 채팅으로 문의하세요.",
    contact: "채팅으로 문의", faqTitle: "자주 묻는 질문",
    faq: [
      ["결제는 몇 번 하나요?", "주문 시 1회입니다. 상품 가격, 국제 배송비, 통관·대행 수수료가 모두 포함된 금액을 한 번에 결제하고, 2차 결제는 없어요."],
      [`수수료는 얼마인가요?`, `상품 가격의 ${PROXY_SERVICE_RATE * 100}%입니다. 국제 배송비는 주문당 1회 붙습니다.`],
      ["환율은 어떻게 적용되나요?", "결제 시점의 환율로 계산됩니다. 상세 페이지의 금액은 현재 환율 기준 예상 금액이에요."],
      ["관세는 별도인가요?", "통관·대행 수수료에 포함해 안내합니다. 세관이 별도로 부과하는 경우 안내드려요."],
      ["배송은 얼마나 걸리나요?", "판매자 발송 → 센터 검수 → 국제 배송 순서로 진행돼요. 마이페이지 주문에서 단계별 상태를 볼 수 있어요."],
      ["품절이면 어떻게 되나요?", "결제 전 품절이면 장바구니에 담기지 않아요. 결제 후 판매자가 취소하면 전액 환불됩니다."],
      ["경매 상품도 되나요?", "야후옥션은 최대 입찰가를 적어 입찰 대행을 신청해요. 낙찰 후 금액이 확정되면 결제합니다."],
      ["거주 국가를 바꿀 수 있나요?", "마이페이지 → 프로필 편집에서 KR/JP를 바꿀 수 있어요. 이미 올린 상품은 그대로 유지돼요."],
      ["계정을 삭제하고 싶어요.", "마이페이지 하단의 탈퇴에서 삭제할 수 있어요. 진행 중인 거래가 있으면 끝난 뒤에 가능해요."],
    ],
  },
  ja: {
    h1: "サポート", sub: "まずよくある質問をご確認ください。解決しない場合はチャットでお問い合わせください。",
    contact: "チャットで問い合わせ", faqTitle: "よくある質問",
    faq: [
      ["決済は何回ですか？", "注文時の1回だけです。商品価格・国際配送費・通関・代行手数料をまとめて決済し、追加請求はありません。"],
      ["手数料はいくらですか？", `商品価格の${PROXY_SERVICE_RATE * 100}%です。国際配送費は注文ごとに1回かかります。`],
      ["為替はどう適用されますか？", "決済時点のレートで計算します。詳細ページの金額は現在レートでの目安です。"],
      ["関税は別ですか？", "通関・代行手数料に含めてご案内します。税関が別途課す場合はお知らせします。"],
      ["配送はどれくらいかかりますか？", "出品者発送 → センター検品 → 国際配送の順です。マイページの注文で段階ごとの状態を確認できます。"],
      ["売り切れの場合は？", "決済前に売り切れならカートに入りません。決済後に出品者がキャンセルした場合は全額返金します。"],
      ["オークション商品も買えますか？", "ヤフオクは最高入札額を入力して入札代行を依頼します。落札後に金額が確定してから決済します。"],
      ["居住国は変更できますか？", "マイページ → プロフィール編集でKR/JPを変更できます。既存の出品はそのままです。"],
      ["アカウントを削除したい。", "マイページ下部の退会から削除できます。進行中の取引がある場合は完了後に可能です。"],
    ],
  },
} as const;

export default async function HelpPage() {
  const lang = await getRequestLang();
  const c = C[lang];
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-[22px] font-extrabold text-ink md:text-3xl">{c.h1}</h1>
      <p className="mt-2 text-sm text-ink-soft">{c.sub}</p>
      <Link href="/chat" className="btn mt-4 inline-block bg-tomo-navy px-5 py-2.5 text-sm text-white">{c.contact}</Link>

      <h2 className="mt-10 text-[17px] font-extrabold text-ink">{c.faqTitle}</h2>
      <div className="mt-3 divide-y divide-tomo-navy/10 rounded-card border border-tomo-navy/10">
        {c.faq.map(([q, a]) => (
          <details key={q} className="group px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
              {q}
              <span className="text-ink-soft transition-transform group-open:rotate-45" aria-hidden>+</span>
            </summary>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{a}</p>
          </details>
        ))}
      </div>
    </main>
  );
}
