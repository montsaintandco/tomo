import Link from "next/link";
import { pageMeta, langFromSearch } from "@/lib/seo";
import { getRequestLang } from "@/lib/locale";
import { SITE_URL } from "@/lib/site";
import { GUIDE_C as C } from "@/lib/guide-content";

// 구매대행 랜딩 — "메루카리 구매대행"·"일본 구매대행"·"야후 플리마 구매대행" 검색 의도용.
// SERP를 지배하는 대행 서비스 랜딩의 문법(수수료표 → 절차 → 신뢰 증빙 → FAQ → 단일 CTA)을 따른다. 수치는 lib/fees 상수·정책 문서와 동일.
export async function generateMetadata(props: { searchParams: Promise<{ lang?: string }> }) {
  return pageMeta("/guide", {
    title: "일본 구매대행 · 메루카리·Yahoo!フリマ 대신 사서 검수 후 배송",
    description: "메루카리·야후 플리마 상품을 TOMO가 대신 구매해 나리타 센터에서 검수한 뒤 한국까지 배송합니다. 수수료·국제배송비·관세를 주문 시 1회 결제, 받을 때 추가 청구 없음. 10~18일 도착.",
  }, langFromSearch(await props.searchParams));
}


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
