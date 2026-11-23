import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { t } from "@/lib/i18n";
import { PageTitle, Empty, More } from "@/components/mypage/MyNav";
import { pageLimit } from "@/lib/notifications";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "문의 내역 · お問い合わせ履歴 | TOMO", robots: { index: false } };

// 문의 내역 — 상담원 연결로 남긴 문의와 운영자 답변. 20건씩 더보기
export default async function MySupport(props: { searchParams: Promise<{ page?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage/support");
  const lang = viewer.language;
  const { n, limit } = pageLimit(sp.page);
  const { data } = await supabase.from("support_tickets").select("id, body, status, reply, created_at")
    .eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(limit + 1);
  const list = (data ?? []).slice(0, limit);

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-none md:p-0 md:pb-16">
      <div className="flex items-baseline justify-between">
        <PageTitle>{t(lang, "my.nav.support")}</PageTitle>
        <Link href="/help" className="press text-[13px] font-bold text-tomo-coral-deep">{t(lang, "support.cta")}</Link>
      </div>
      <div className="flex flex-col gap-2">
        {list.map((k) => (
          <div key={k.id} className="card p-3.5 text-[13px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-ink-soft">{new Date(k.created_at).toLocaleDateString(lang === "ja" ? "ja-JP" : "ko-KR")}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${k.status === "open" ? "bg-tomo-coral-deep/10 text-tomo-coral-deep" : "bg-tomo-navy/5 text-ink-soft"}`}>
                {t(lang, k.status === "open" ? "my.supportOpen" : k.status === "answered" ? "my.supportAnswered" : "my.supportClosed")}
              </span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-ink">{k.body}</p>
            {k.reply && <p className="mt-2 whitespace-pre-wrap rounded-card bg-tomo-navy/5 p-2.5 text-ink"><span className="font-bold">TOMO</span> · {k.reply}</p>}
          </div>
        ))}
        {list.length === 0 && <Empty text={t(lang, "my.noSupport")} />}
      </div>
      <More lang={lang} href={(data ?? []).length > limit ? `/mypage/support?page=${n + 1}` : null} />
    </main>
  );
}
