import { getRequestLang } from "@/lib/locale";
import { NOTICES } from "@/lib/notices";

export const metadata = { title: "공지사항 · お知らせ | TOMO" };

// 공지사항 — 사줘의 "공지사항"에 해당. ponytail: 코드 테이블(lib/notices.ts), 운영 공지가 잦아지면 admin 테이블로
const C = { ko: { h1: "공지사항", empty: "아직 공지가 없어요." }, ja: { h1: "お知らせ", empty: "まだお知らせはありません。" } } as const;

export default async function NoticePage() {
  const lang = await getRequestLang();
  const c = C[lang];
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-[22px] font-extrabold text-ink md:text-3xl">{c.h1}</h1>
      {NOTICES.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">{c.empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-tomo-navy/10 rounded-card border border-tomo-navy/10">
          {NOTICES.map((n) => (
            <li key={n.date + n.title.ko}>
              <details className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span className="text-sm font-bold text-ink">{n.title[lang]}</span>
                  <time dateTime={n.date} className="tnum shrink-0 text-[12px] text-ink-soft">{n.date}</time>
                </summary>
                <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">{n.body[lang]}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
