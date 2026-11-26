import Link from "next/link";
import { jsonLd } from "@/lib/json-ld";
import { pageMeta } from "@/lib/seo";
import { getRequestLang } from "@/lib/locale";
import { t, type Lang } from "@/lib/i18n";
import { formatPrice } from "@/lib/currency";
import { CUSTOMS_FREE_LIMIT, proxyOrderTotal } from "@/lib/fees";
import { GUIDE_C as C } from "@/lib/guide-content";

// 구매대행 랜딩 — "메루카리 구매대행"·"일본 구매대행"·"야후 플리마 구매대행" 검색 의도용.
// HowTo 구조화 데이터는 넣지 않는다(구글 지원 종료, 10-schema). FAQPage 만.
// SERP를 지배하는 대행 서비스 랜딩의 문법(수수료표 → 절차 → 신뢰 증빙 → FAQ → 단일 CTA)을 따른다. 수치는 lib/fees 상수·정책 문서와 동일.
export async function generateMetadata() {
  return pageMeta("/guide", "guide", await getRequestLang());
}


export default async function GuidePage() {
  const lang = await getRequestLang();
  const c = C[lang];
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: c.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqLd) }} />
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

      <TotalExample lang={lang} />

      <section className="mt-10" aria-labelledby="kr-market" lang="ja">
        <h2 id="kr-market" className="text-[17px] font-extrabold text-ink">{t("ja", "seo.kr.title")}</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink-soft">
          {(["seo.kr.s1", "seo.kr.s2", "seo.kr.s3", "seo.kr.s4"] as const).map((k) => <li key={k}>{t("ja", k)}</li>)}
        </ol>
        {lang === "ko" && (
          <div lang="ko" className="mt-4 rounded-card bg-tomo-navy/5 p-4">
            <h3 className="text-sm font-bold text-ink">{t("ko", "seo.kr.title")}</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-ink-soft">
              {(["seo.kr.s1", "seo.kr.s2", "seo.kr.s3", "seo.kr.s4"] as const).map((k) => <li key={k}>{t("ko", k)}</li>)}
            </ol>
          </div>
        )}
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

// 예상 총액 예시 — 예시 상품가만 정하고 금액은 lib/fees.ts proxyOrderTotal(주문서와 같은 계산)로 서버에서 낸다.
// ko = 메루카리 상품(원화 환산가), ja = 한국 마켓 상품(엔화 환산가). 면세 한도 이하·초과 한 칸씩
const EXAMPLE_PRICE = { KRW: [50000, 300000], JPY: [5000, 20000] } as const;

function TotalExample({ lang }: { lang: Lang }) {
  const cur = lang === "ja" ? "JPY" : "KRW";
  const cols = EXAMPLE_PRICE[cur].map((price) => proxyOrderTotal([{ price, currency: cur }], cur, 1));
  const fmt = (n: number) => formatPrice(n, cur, lang);
  const rows = [["seo.ex.price", "subtotal"], ["seo.ex.ship", "intlShipping"], ["seo.ex.customs", "customs"], ["seo.ex.total", "total"]] as const;
  return (
    <section className="mt-10" aria-labelledby="example">
      <h2 id="example" className="text-[17px] font-extrabold text-ink">{t(lang, "seo.ex.title")}</h2>
      <div className="mt-3 overflow-x-auto rounded-card border border-tomo-navy/10">
        <table className="w-full text-sm">
          <thead className="bg-tomo-navy/5 text-[12px] text-ink-soft">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-bold"></th>
              <th scope="col" className="px-4 py-2 text-right font-bold">{t(lang, "seo.ex.colA")} ({fmt(CUSTOMS_FREE_LIMIT[cur])})</th>
              <th scope="col" className="px-4 py-2 text-right font-bold">{t(lang, "seo.ex.colB")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tomo-navy/10">
            {rows.map(([k, f]) => (
              <tr key={k} className={f === "total" ? "font-bold text-ink" : "text-ink-soft"}>
                <th scope="row" className="px-4 py-2.5 text-left font-bold text-ink">{t(lang, k)}</th>
                {cols.map((c, i) => <td key={i} className="tnum px-4 py-2.5 text-right">{fmt(c[f])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-ink-soft">{t(lang, "seo.ex.note")}</p>
    </section>
  );
}
