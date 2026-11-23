import { getRequestLang } from "@/lib/locale";
import { pageMeta, langFromSearch } from "@/lib/seo";
import { loadNotices } from "@/lib/notices";
import { createServerSupabase } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";

export async function generateMetadata(props: { searchParams: Promise<{ lang?: string }> }) {
  return pageMeta("/notice", { title: "공지사항 · お知らせ", description: "TOMO 서비스 공지사항 — 업데이트, 점검, 정책 변경 안내." }, langFromSearch(await props.searchParams));
}

// 공지사항 — 사줘의 "공지사항"에 해당. notices 표(어드민 /admin/notices)가 정본, 표 없음·오류·0건이면 lib/notices.ts 코드 목록
const C = { ko: { h1: "공지사항", empty: "아직 공지가 없어요." }, ja: { h1: "お知らせ", empty: "まだお知らせはありません。" } } as const;

export default async function NoticePage() {
  const lang = await getRequestLang();
  const c = C[lang];
  const notices = await loadNotices(await createServerSupabase());
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-[22px] font-extrabold text-ink md:text-3xl">{c.h1}</h1>
      {notices.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">{c.empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-tomo-navy/10 rounded-card border border-tomo-navy/10">
          {notices.map((n) => (
            <li key={n.id ?? n.date + n.title.ko}>
              <details className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span className="text-sm font-bold text-ink">
                    {n.pinned && <span className="mr-1.5 rounded bg-tomo-coral-deep/10 px-1.5 py-0.5 text-[11px] text-tomo-coral-deep">{t(lang, "notice.pinned")}</span>}
                    {n.title[lang]}
                  </span>
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
