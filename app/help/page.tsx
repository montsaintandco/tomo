import { getRequestLang } from "@/lib/locale";
import { jsonLd } from "@/lib/json-ld";
import { pageMeta } from "@/lib/seo";
import SupportBot from "@/components/SupportBot";
import { createServerSupabase } from "@/lib/supabase/server";
import { company } from "@/lib/company";
import { t } from "@/lib/i18n";
import { HELP_C as C } from "@/lib/help-faq";
import { aiEnabled } from "@/lib/support-ai.server";

export async function generateMetadata() {
  return pageMeta("/help", "help", await getRequestLang());
}

// 고객센터 — 사줘의 "고객센터"에 해당. 봇 → FAQ 목록(네이티브 <details>) → 연락처 순. 문의는 채팅. 운영시간 등 미확정 정보는 적지 않는다

export default async function HelpPage() {
  const lang = await getRequestLang();
  const { data: auth } = await (await createServerSupabase()).auth.getUser();
  const loggedIn = !!auth.user;
  const c = C[lang];
  // FAQPage 구조화 데이터 — 화면의 Q&A와 동일 텍스트
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: c.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqLd) }} />
      <h1 className="text-[22px] font-extrabold text-ink md:text-3xl">{c.h1}</h1>
      <p className="mt-2 text-sm text-ink-soft">{c.sub}</p>
      {/* 모바일은 봇이 첫 화면을 다 차지한다 — FAQ 목록으로 바로 내려가는 입구(04 고객센터) */}
      <a href="#faq" className="mt-2 inline-block text-sm font-bold text-ink underline underline-offset-2">{t(lang, "seo.help.toFaq", { n: c.faq.length })}</a>
      {/* 사조식 봇을 고객센터 첫 화면에 — 버튼 트리로 답하고, 특정 주문은 상담원(채팅)으로 */}
      <div className="mt-5 overflow-hidden rounded-card border border-tomo-navy/10 bg-white shadow-soft">
        <SupportBot lang={lang} loggedIn={loggedIn} ai={aiEnabled()} />
      </div>

      <h2 id="faq" className="mt-8 scroll-mt-20 text-[17px] font-extrabold text-ink">{c.faqTitle}</h2>
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

      {/* 연락처 — 심사 항목: CS 전화·이메일·운영시간이 사이트에 보여야 한다 */}
      <section aria-label={t(lang, "help.contact")} className="mt-10 grid gap-2 rounded-card border border-tomo-navy/10 p-4 text-[13px] sm:grid-cols-3">
        {company.phone && <div><p className="text-[11px] font-bold text-ink-soft">{t(lang, "footer.phone")}</p><a href={`tel:${company.phone.replace(/[^0-9+]/g, "")}`} className="font-bold text-ink">{company.phone}</a></div>}
        <div><p className="text-[11px] font-bold text-ink-soft">{t(lang, "footer.email")}</p>{company.email ? <a href={`mailto:${company.email}`} className="font-bold text-ink">{company.email}</a> : <p className="text-ink-soft">{t(lang, "footer.pending")}</p>}</div>
        <div><p className="text-[11px] font-bold text-ink-soft">{t(lang, "footer.hours")}</p><p className="text-ink">{company.hours ?? t(lang, "footer.pending")}</p></div>
      </section>
    </main>
  );
}
