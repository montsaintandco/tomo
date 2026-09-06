import Link from "next/link";
import { company } from "@/lib/company";

// 약관류 공용 레이아웃 — 제목·시행일·조항. 사업자 정보는 env에서 채워 넣는다 (심사: 약관에 상호·연락처가 있어야 함)
export type Section = { h: string; p: string[] };

export default function LegalDoc({ title, effective, intro, sections, lang, related }: {
  title: string; effective: string; intro?: string; sections: Section[]; lang: "ko" | "ja"; related: { href: string; label: string }[];
}) {
  const na = lang === "ja" ? "準備中" : "준비 중";
  const fill = (s: string) => s
    .replaceAll("{company}", company.name ?? (lang === "ja" ? "TOMO運営会社" : "TOMO 운영사"))
    .replaceAll("{ceo}", company.ceo ?? na).replaceAll("{address}", company.address ?? na)
    .replaceAll("{phone}", company.phone ?? na).replaceAll("{email}", company.email ?? na)
    .replaceAll("{hours}", company.hours ?? na).replaceAll("{officer}", company.privacyOfficer ?? company.email ?? na)
    .replaceAll("{returnAddress}", company.returnAddress ?? na).replaceAll("{bizNo}", company.bizNo ?? na)
    .replaceAll("{mailOrderNo}", company.mailOrderNo ?? na);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-[22px] font-extrabold text-ink md:text-3xl">{title}</h1>
      <p className="mt-1 text-[12px] text-ink-soft">{effective}</p>
      {intro && <p className="mt-4 text-sm leading-relaxed text-ink">{fill(intro)}</p>}
      <div className="mt-6 flex flex-col gap-6">
        {sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-[15px] font-bold text-ink">{s.h}</h2>
            {s.p.map((line, i) => <p key={i} className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{fill(line)}</p>)}
          </section>
        ))}
      </div>
      <nav className="mt-10 flex flex-wrap gap-x-4 gap-y-1 text-[12px]" aria-label={lang === "ja" ? "関連文書" : "관련 문서"}>
        {related.map((r) => <Link key={r.href} href={r.href} className="text-tomo-coral-deep underline underline-offset-2">{r.label}</Link>)}
      </nav>
    </main>
  );
}
