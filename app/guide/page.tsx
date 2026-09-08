import Link from "next/link";
import { pageMeta, langFromSearch } from "@/lib/seo";
import { getRequestLang } from "@/lib/locale";
import { SITE_URL } from "@/lib/site";
import { CUSTOMS_FREE_LIMIT, PROXY_SHIPPING_ESTIMATE_JPY, PROXY_SHIPPING_ESTIMATE_KRW } from "@/lib/fees";

// 구매대행 랜딩 — "메루카리 구매대행"·"일본 구매대행"·"야후 플리마 구매대행" 검색 의도용.
// SERP를 지배하는 대행 서비스 랜딩의 문법(수수료표 → 절차 → 신뢰 증빙 → FAQ → 단일 CTA)을 따른다. 수치는 lib/fees 상수·정책 문서와 동일.
export async function generateMetadata(props: { searchParams: Promise<{ lang?: string }> }) {
  return pageMeta("/guide", {
    title: "일본 구매대행 · 메루카리·Yahoo!フリマ 대신 사서 검수 후 배송",
    description: "메루카리·야후 플리마 상품을 TOMO가 대신 구매해 나리타 센터에서 검수한 뒤 한국까지 배송합니다. 수수료·국제배송비·관세를 주문 시 1회 결제, 받을 때 추가 청구 없음. 10~18일 도착.",
  }, langFromSearch(await props.searchParams));
}

const C = {
  ko: {
    h1: "일본 구매대행, 검수까지 한 번에",
    lead: "메루카리·Yahoo!フリマ 상품 링크만 붙여넣으면 TOMO가 대신 사서 나리타 센터에서 확인한 뒤 집까지 보내드려요. 결제는 주문 때 한 번, 받을 때 추가 비용 없음.",
    cta: "상품 검색·링크 붙여넣기", cta2: "고객센터",
    feeTitle: "비용은 세 가지뿐",
    fee: [
      ["상품 가격", "메루카리·야후 플리마 판매가에 결제 시점 환율 적용"],
      ["국제 배송비", `주문당 1회. 무게·부피로 미리 예측 (소형 기준 약 ${PROXY_SHIPPING_ESTIMATE_JPY.toLocaleString()}엔 / ${PROXY_SHIPPING_ESTIMATE_KRW.toLocaleString()}원)`],
      ["통관·관세", `관세·세금·통관·보험 일체. 면세 한도(${CUSTOMS_FREE_LIMIT.KRW.toLocaleString()}원) 이하면 상품가의 10%, 초과 시 관세 8%·부가세 10% + 5%`],
    ],
    feeNote: "주문서에서 세 항목이 전부 계산된 총액을 보고 결제해요. 받으실 때 관세를 따로 내지 않습니다.",
    howTitle: "4단계로 끝나요",
    how: [
      ["링크 붙여넣기", "메루카리·야후 플리마 상품 URL을 검색창에 붙여넣거나 TOMO에서 바로 검색해요."],
      ["1회 결제", "상품가 + 국제배송비 + 통관·관세가 합산된 주문서를 확인하고 한 번만 결제해요. 결제 전까지는 취소 가능."],
      ["현지 구매 → 센터 검수", "TOMO가 즉시 현지에서 구매해 나리타 센터로 받고, 상품 상태·수량을 확인한 뒤 국제배송해요."],
      ["집에서 수령", "국제특송으로 통관을 거쳐 국내 택배로 도착. 결제 후 약 10~18일."],
    ],
    whyTitle: "일반 구매대행과 다른 점",
    why: [
      ["센터 검수", "판매자가 보낸 그대로 전달하지 않고 나리타 센터에서 열어 확인해요. 파손·오배송·수량 불일치는 검수 단계에서 걸러 환불해요."],
      ["에스크로", "결제 금액은 받고 확인하기 전까지 TOMO가 보관해요. 판매처가 취소하면 전액 환불."],
      ["추가 청구 없음", "관세·통관 수수료가 주문서에 미리 포함돼요. 배송 기사에게 따로 내는 돈이 없어요."],
      ["한국어로 그대로", "상품 제목·설명은 자동 번역, 판매자와의 대화도 한국어로 쓰면 일본어로 전달돼요."],
    ],
    faqTitle: "자주 묻는 질문",
    faq: [
      ["메루카리 구매대행 수수료는 얼마인가요?", "별도 대행 수수료 항목 없이 상품 가격 + 국제 배송비 + 통관·관세 세 가지만 결제해요. 통관·관세는 면세 한도 이하 상품가의 10%, 초과 시 세금 + 5%로 주문서에서 미리 계산됩니다."],
      ["배송은 얼마나 걸리나요?", "결제 후 약 10~18일이에요. 판매자 발송 4~7일, 센터 검수 1~2일, 국제배송·통관 4~7일."],
      ["야후 플리마도 되나요?", "네. 메루카리와 Yahoo!フリマ(PayPay 플리마) 상품 모두 링크 붙여넣기나 검색으로 신청할 수 있어요. 야후옥션은 준비 중이에요."],
      ["검수에서 문제가 발견되면요?", "파손·오배송·수량 불일치는 센터에서 발견 즉시 안내하고 환불해요. 환불 기준은 취소·환불 정책에 있어요."],
      ["결제는 몇 번 하나요?", "주문 시 1회입니다. 받으실 때 추가 청구는 없어요."],
      ["관세는 언제 내나요?", "주문서의 '통관·관세' 항목에 미리 포함돼 있어 따로 내지 않아요."],
    ],
    legal: ["취소·환불 정책", "이용약관"],
  },
  ja: {
    h1: "韓国の商品を代わりに購入、検品まで一度に",
    lead: "タングン・中古ナラの商品リンクを貼るだけで、TOMOが代わりに購入してソウルセンターで確認し、ご自宅までお届けします。決済は注文時に1回、受け取り時の追加費用なし。",
    cta: "商品を検索・リンクを貼る", cta2: "サポート",
    feeTitle: "費用は3つだけ",
    fee: [
      ["商品価格", "元マーケットの販売価格に決済時点の為替を適用"],
      ["国際配送費", `注文ごとに1回。重量・サイズで事前見積もり（小型で約${PROXY_SHIPPING_ESTIMATE_KRW.toLocaleString()}ウォン / ${PROXY_SHIPPING_ESTIMATE_JPY.toLocaleString()}円）`],
      ["通関・関税", `関税・税金・通関・保険一式。免税枠（${CUSTOMS_FREE_LIMIT.JPY.toLocaleString()}円）内なら商品価格の10%、超過時は消費税10% + 5%`],
    ],
    feeNote: "注文画面で3項目すべてを合算した総額を確認して決済します。お受け取り時に関税を別途支払うことはありません。",
    howTitle: "4ステップで完了",
    how: [
      ["リンクを貼る", "タングン・中古ナラの商品URLを検索窓に貼るか、TOMOで直接検索します。"],
      ["1回の決済", "商品価格 + 国際配送費 + 通関・関税を合算した注文画面を確認し、1回だけ決済。決済前までキャンセル可能。"],
      ["現地購入 → センター検品", "TOMOがすぐに現地で購入してソウルセンターで受け取り、状態・数量を確認してから国際配送します。"],
      ["自宅で受け取り", "国際スピード便で通関を経て国内宅配で到着。決済後約10〜18日。"],
    ],
    whyTitle: "一般的な購入代行との違い",
    why: [
      ["センター検品", "出品者が送ったままではなく、ソウルセンターで開封して確認します。破損・誤配送・数量違いは検品段階で返金。"],
      ["エスクロー", "決済金額は受け取り確認までTOMOが預かります。販売元がキャンセルした場合は全額返金。"],
      ["追加請求なし", "関税・通関手数料は注文画面に含まれています。配達員に別途支払う費用はありません。"],
      ["日本語のまま", "商品タイトル・説明は自動翻訳、出品者との会話も日本語で書けば韓国語で届きます。"],
    ],
    faqTitle: "よくある質問",
    faq: [
      ["購入代行の手数料はいくらですか？", "別途の代行手数料はなく、商品価格 + 国際配送費 + 通関・関税の3つだけを決済します。通関・関税は免税枠内なら商品価格の10%、超過時は税金 + 5%で注文画面に事前計算されます。"],
      ["配送はどれくらいかかりますか？", "決済後約10〜18日です。出品者発送4〜7日、センター検品1〜2日、国際配送・通関4〜7日。"],
      ["中古ナラも対応していますか？", "はい。タングンと中古ナラの商品はリンク貼り付けか検索で依頼できます。"],
      ["検品で問題が見つかったら？", "破損・誤配送・数量違いはセンターで発見次第ご案内して返金します。基準はキャンセル・返金ポリシーに記載しています。"],
      ["決済は何回ですか？", "注文時の1回だけ。受け取り時の追加請求はありません。"],
      ["関税はいつ払いますか？", "注文画面の「通関・関税」項目に含まれているため、別途支払いはありません。"],
    ],
    legal: ["キャンセル・返金ポリシー", "利用規約"],
  },
} as const;

export default async function GuidePage() {
  const lang = await getRequestLang();
  const c = C[lang];
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: c.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  const howLd = {
    "@context": "https://schema.org", "@type": "HowTo", name: c.h1, url: `${SITE_URL}/guide`,
    step: c.how.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text })),
  };
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([faqLd, howLd]) }} />
      <h1 className="text-[22px] font-extrabold leading-tight text-ink md:text-3xl">{c.h1}</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">{c.lead}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/global" className="btn bg-tomo-coral-deep px-5 py-2.5 text-sm text-white">{c.cta}</Link>
        <Link href="/help" className="btn border-[1.5px] border-tomo-navy/15 bg-white px-5 py-2.5 text-sm text-ink">{c.cta2}</Link>
      </div>

      <section className="mt-10" aria-labelledby="fee">
        <h2 id="fee" className="text-[17px] font-extrabold text-ink">{c.feeTitle}</h2>
        <dl className="mt-3 divide-y divide-tomo-navy/10 rounded-card border border-tomo-navy/10 text-sm">
          {c.fee.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr]">
              <dt className="font-bold text-ink">{k}</dt><dd className="text-ink-soft">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[12px] text-ink-soft">{c.feeNote}</p>
      </section>

      <section className="mt-10" aria-labelledby="how">
        <h2 id="how" className="text-[17px] font-extrabold text-ink">{c.howTitle}</h2>
        <ol className="mt-3 grid gap-2 md:grid-cols-2">
          {c.how.map(([name, text], i) => (
            <li key={name} className="rounded-card bg-tomo-navy/5 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-ink">
                <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tomo-navy text-[12px] text-white">{i + 1}</span>{name}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10" aria-labelledby="why">
        <h2 id="why" className="text-[17px] font-extrabold text-ink">{c.whyTitle}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {c.why.map(([k, v]) => (
            <li key={k} className="rounded-card border border-tomo-navy/10 p-4">
              <p className="text-sm font-bold text-ink">{k}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{v}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="faq">
        <h2 id="faq" className="text-[17px] font-extrabold text-ink">{c.faqTitle}</h2>
        <div className="mt-3 divide-y divide-tomo-navy/10 rounded-card border border-tomo-navy/10">
          {c.faq.map(([q, a]) => (
            <details key={q} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <h3 className="text-sm font-bold text-ink">{q}</h3>
                <span className="text-ink-soft transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="reveal mt-2 text-[13px] leading-relaxed text-ink-soft">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-ink-soft">
          <Link href="/refund" className="underline hover:text-ink">{c.legal[0]}</Link> · <Link href="/terms" className="underline hover:text-ink">{c.legal[1]}</Link>
        </p>
      </section>

      <div className="mt-10 rounded-card bg-tomo-navy p-5 text-white">
        <p className="text-[15px] font-bold">{c.h1}</p>
        <Link href="/global" className="btn mt-3 inline-block bg-white px-5 py-2.5 text-sm text-tomo-navy">{c.cta}</Link>
      </div>
    </main>
  );
}
