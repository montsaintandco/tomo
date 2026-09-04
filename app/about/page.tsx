import Link from "next/link";
import { getRequestLang } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { PROXY_SERVICE_RATE } from "@/lib/fees";

export const metadata = { title: "서비스 소개 · サービス紹介 | TOMO" };

// 서비스 소개 — 사줘의 "서비스 소개"에 해당. 사실만: 수수료·배송·검수·양방향. 수치는 lib/fees 상수에서
const C = {
  ko: {
    h1: "일본에서만 파는 물건도, 한국에서만 파는 물건도",
    lead: "TOMO는 한국과 일본의 중고마켓을 한 곳에서 보고, 한 번 결제로 집까지 받는 서비스예요. 메루카리·야후옥션·당근·중고나라 상품을 내 언어, 내 통화로 봅니다.",
    howTitle: "이렇게 진행돼요",
    feeTitle: "비용은 이것뿐",
    feeRows: [["상품 가격", "원본 마켓 판매가를 환율 적용"], ["국제 배송비", "주문당 1회"], [`통관·대행 수수료 ${PROXY_SERVICE_RATE * 100}%`, "상품가 기준"]],
    feeNote: "주문 시 1회 결제, 2차 결제 없음. 환율은 결제 시점 기준.",
    trustTitle: "안전장치",
    trust: [["에스크로 안전결제", "받고 확인한 뒤에 정산돼요."], ["센터 검수", "서울·나리타 센터에서 확인 후 국제배송."], ["채팅 자동번역", "한국어·일본어 그대로 대화해요."]],
    bothTitle: "양방향이에요",
    both: "한국에서 일본 상품을, 일본에서 한국 상품을. 거주 국가는 마이페이지에서 바꿀 수 있어요.",
    cta: "해외직구 둘러보기", cta2: "고객센터",
  },
  ja: {
    h1: "日本だけの商品も、韓国だけの商品も",
    lead: "TOMOは韓国と日本のフリマを一か所で見て、1回の決済で自宅まで届くサービスです。メルカリ・ヤフオク・タングン・中古ナラの商品を自分の言語・通貨で。",
    howTitle: "流れ",
    feeTitle: "費用はこれだけ",
    feeRows: [["商品価格", "元マーケットの価格に為替を適用"], ["国際配送費", "注文ごとに1回"], [`通関・代行手数料 ${PROXY_SERVICE_RATE * 100}%`, "商品価格ベース"]],
    feeNote: "注文時に1回のみ決済、追加請求なし。為替は決済時点のレート。",
    trustTitle: "安心機能",
    trust: [["エスクロー安心決済", "受け取り確認後に精算。"], ["センター検品", "ソウル・成田センターで確認後に国際配送。"], ["チャット自動翻訳", "韓国語・日本語そのままで会話。"]],
    bothTitle: "双方向です",
    both: "韓国から日本の商品を、日本から韓国の商品を。居住国はマイページで変更できます。",
    cta: "海外購入を見る", cta2: "サポート",
  },
} as const;

export default async function AboutPage() {
  const lang = await getRequestLang();
  const c = C[lang];
  const steps = ["ext.step1", "ext.step2", "ext.step3", "ext.step4"] as const;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-[22px] font-extrabold leading-tight text-ink md:text-3xl">{c.h1}</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">{c.lead}</p>

      <section className="mt-10">
        <h2 className="text-[17px] font-extrabold text-ink">{c.howTitle}</h2>
        <ol className="mt-3 grid gap-2 md:grid-cols-2">
          {steps.map((k, i) => (
            <li key={k} className="flex gap-3 rounded-card bg-tomo-navy/5 p-4 text-sm text-ink">
              <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tomo-navy text-[12px] font-bold text-white">{i + 1}</span>
              <span className="leading-snug">{t(lang, k)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="text-[17px] font-extrabold text-ink">{c.feeTitle}</h2>
        <dl className="mt-3 divide-y divide-tomo-navy/10 rounded-card border border-tomo-navy/10 text-sm">
          {c.feeRows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-3"><dt className="font-bold text-ink">{k}</dt><dd className="text-right text-ink-soft">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-2 text-[13px] font-bold text-tomo-navy">{c.feeNote}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-[17px] font-extrabold text-ink">{c.trustTitle}</h2>
        <ul className="mt-3 grid gap-3 md:grid-cols-3">
          {c.trust.map(([k, v]) => (
            <li key={k} className="rounded-card bg-tomo-ivory p-4"><p className="text-sm font-bold text-tomo-navy">{k}</p><p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{v}</p></li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-[17px] font-extrabold text-ink">{c.bothTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{c.both}</p>
      </section>

      <div className="mt-10 flex gap-2">
        <Link href="/global" className="btn bg-tomo-coral-deep px-5 py-3 text-sm text-white">{c.cta}</Link>
        <Link href="/help" className="btn bg-white px-5 py-3 text-sm text-tomo-navy shadow-soft">{c.cta2}</Link>
      </div>
    </main>
  );
}
