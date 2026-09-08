import { getRequestLang } from "@/lib/locale";
import SupportBot from "@/components/SupportBot";
import { createServerSupabase } from "@/lib/supabase/server";
import { company } from "@/lib/company";
import { t } from "@/lib/i18n";

export const metadata = { title: "고객센터 · サポート", description: "구매대행 수수료, 배송 기간, 관세, 검수 실패 시 환불 등 TOMO 이용 중 자주 묻는 질문과 답변. 1:1 채팅 문의 안내.", alternates: { canonical: "/help" } };

// 고객센터 — 사줘의 "고객센터"에 해당. FAQ는 네이티브 <details>, 문의는 채팅. 운영시간 등 미확정 정보는 적지 않는다
const C = {
  ko: {
    h1: "고객센터", sub: "궁금한 걸 아래에서 고르면 바로 답해 드려요. 특정 주문·상품은 상담원 연결로.",
    contact: "채팅으로 문의", faqTitle: "자주 묻는 질문",
    faq: [
      ["결제는 몇 번 하나요?", "주문 시 1회입니다. 상품 소계, 국제 배송비, 통관·관세가 모두 포함된 금액을 한 번에 결제하고, 받으실 때 추가 청구는 없어요."],
      ["통관·관세는 어떻게 계산되나요?", "관세·세금·통관 수수료·보험료를 합친 항목이에요. 면세 한도(약 20만원) 이하면 상품 소계의 10%, 초과하면 관세 8%·부가세 10%에 5%를 더해 주문서에서 미리 계산해요."],
      ["환율은 어떻게 적용되나요?", "결제 시점의 환율로 계산됩니다. 상세 페이지의 금액은 현재 환율 기준이에요."],
      ["받을 때 관세를 따로 내나요?", "아니요. 통관·관세 항목에 미리 포함되어 있어 받으실 때 추가로 내는 금액은 없어요."],
      ["현지 배송비가 따로 붙나요?", "대부분 무료지만 일부 판매처는 현지 배송비가 있어요. 그 경우 주문서에 '현지 유통비' 항목으로 따로 표시되고, 무료배송 기준을 넘겼거나 중복 청구됐으면 확인 후 환불해요."],
      ["배송은 얼마나 걸리나요?", "약 10~18일이에요. 판매자 발송 4~7일, 센터 검수 1~2일, 국제배송·통관 4~7일. 마이페이지 주문에서 단계별 상태를 볼 수 있어요."],
      ["통관 진행은 어디서 확인하나요?", "한국은 관세청 유니패스(unipass.customs.go.kr)에서 개인통관고유부호나 운송장번호로 조회할 수 있어요. 세관이 추가 서류를 요청하면 채팅으로 알려주세요. 대신 처리해 드려요."],
      ["주문 취소는 되나요?", "결제 대기 상태에서는 마이페이지에서 취소할 수 있어요. 결제가 끝나면 즉시 현지에서 매입하기 때문에 단순 변심 취소는 안 돼요. 판매처 사정으로 취소되면 전액 환불돼요."],
      ["표시된 금액이 이상해요.", "채팅으로 알려주세요. 주문 전이면 상품 URL을, 주문 후면 주문번호와 상품명을 보내주시면 확인 후 안내드려요."],
      ["품절이면 어떻게 되나요?", "결제 전 품절이면 장바구니에 담기지 않아요. 결제 후 판매자가 취소하면 전액 환불됩니다."],
      ["거주 국가를 바꿀 수 있나요?", "마이페이지 → 프로필 편집에서 KR/JP를 바꿀 수 있어요. 이미 올린 상품은 그대로 유지돼요."],
      ["계정을 삭제하고 싶어요.", "마이페이지 하단의 탈퇴에서 삭제할 수 있어요. 진행 중인 거래가 있으면 끝난 뒤에 가능해요."],
    ],
  },
  ja: {
    h1: "サポート", sub: "知りたいことを下から選ぶとすぐお答えします。特定の注文・商品は担当者へ。",
    contact: "チャットで問い合わせ", faqTitle: "よくある質問",
    faq: [
      ["決済は何回ですか？", "注文時の1回だけです。商品小計・国際配送費・通関・関税をまとめて決済し、お受け取り時の追加請求はありません。"],
      ["通関・関税はどう計算されますか？", "関税・税金・通関手数料・保険料を合わせた項目です。免税枠（約1万円）内なら商品小計の10%、超える場合は消費税10%に5%を加えて注文画面で事前に計算します。"],
      ["為替はどう適用されますか？", "決済時点のレートで計算します。詳細ページの金額は現在レートです。"],
      ["受け取り時に関税を別途払いますか？", "いいえ。通関・関税の項目に含まれているため、お受け取り時に追加で支払う金額はありません。"],
      ["現地配送費は別にかかりますか？", "ほとんど無料ですが、一部の販売元では現地配送費がかかります。その場合は注文画面に「現地配送費」として別途表示され、送料無料条件を満たしていたり二重請求があれば確認後に返金します。"],
      ["配送はどれくらいかかりますか？", "約10〜14日です。販売元発送・現地移動4〜6日、国際配送・受け取り6〜8日。マイページの注文で段階ごとの状態を確認できます。"],
      ["通関の進行はどこで確認できますか？", "韓国は関税庁UNI-PASS（unipass.customs.go.kr）で個人通関固有番号または追跡番号で照会できます。税関から追加書類を求められたらチャットでご連絡ください。代わりに対応します。"],
      ["注文のキャンセルはできますか？", "決済待ちの状態ならマイページでキャンセルできます。決済後はすぐに現地で買い付けるため、都合によるキャンセルはできません。販売元の都合でキャンセルになった場合は全額返金します。"],
      ["表示された金額がおかしいです。", "チャットでお知らせください。注文前なら商品URL、注文後なら注文番号と商品名を送っていただければ確認してご案内します。"],
      ["売り切れの場合は？", "決済前に売り切れならカートに入りません。決済後に出品者がキャンセルした場合は全額返金します。"],
      ["居住国は変更できますか？", "マイページ → プロフィール編集でKR/JPを変更できます。既存の出品はそのままです。"],
      ["アカウントを削除したい。", "マイページ下部の退会から削除できます。進行中の取引がある場合は完了後に可能です。"],
    ],
  },
} as const;

export default async function HelpPage() {
  const lang = await getRequestLang();
  const { data: auth } = await (await createServerSupabase()).auth.getUser();
  const loggedIn = !!auth.user;
  const c = C[lang];
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-[22px] font-extrabold text-ink md:text-3xl">{c.h1}</h1>
      <p className="mt-2 text-sm text-ink-soft">{c.sub}</p>
      {/* 사조식 봇을 고객센터 첫 화면에 — 버튼 트리로 답하고, 특정 주문은 상담원(채팅)으로 */}
      <div className="mt-5 overflow-hidden rounded-card border border-tomo-navy/10 bg-white shadow-soft">
        <SupportBot lang={lang} loggedIn={loggedIn} />
      </div>

      {/* 연락처 — 심사 항목: CS 전화·이메일·운영시간이 사이트에 보여야 한다 */}
      <section aria-label={t(lang, "help.contact")} className="mt-6 grid gap-2 rounded-card border border-tomo-navy/10 p-4 text-[13px] sm:grid-cols-3">
        {company.phone && <div><p className="text-[11px] font-bold text-ink-soft">{t(lang, "footer.phone")}</p><a href={`tel:${company.phone.replace(/[^0-9+]/g, "")}`} className="font-bold text-ink">{company.phone}</a></div>}
        <div><p className="text-[11px] font-bold text-ink-soft">{t(lang, "footer.email")}</p>{company.email ? <a href={`mailto:${company.email}`} className="font-bold text-ink">{company.email}</a> : <p className="text-ink-soft">{t(lang, "footer.pending")}</p>}</div>
        <div><p className="text-[11px] font-bold text-ink-soft">{t(lang, "footer.hours")}</p><p className="text-ink">{company.hours ?? t(lang, "footer.pending")}</p></div>
      </section>

      <h2 className="mt-10 text-[17px] font-extrabold text-ink">{c.faqTitle}</h2>
      <div className="mt-3 divide-y divide-tomo-navy/10 rounded-card border border-tomo-navy/10">
        {c.faq.map(([q, a]) => (
          <details key={q} className="group px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
              {q}
              <span className="text-ink-soft transition-transform group-open:rotate-45" aria-hidden>+</span>
            </summary>
            <p className="reveal mt-2 text-[13px] leading-relaxed text-ink-soft">{a}</p>
          </details>
        ))}
      </div>
    </main>
  );
}
