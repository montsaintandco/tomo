import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { t } from "@/lib/i18n";
import { PageTitle, Empty, More } from "@/components/mypage/MyNav";
import { NotifItem, NotifReadAll } from "@/components/NotificationBell";
import { rows, tableMissing } from "@/lib/safe";
import { notifHref, notifSub, notifText, pageLimit, type Notif } from "@/lib/notifications";
import { redirect } from "next/navigation";

export const metadata = { title: "알림 · お知らせ", robots: { index: false } };

// 알림함 — 거래·대행·문의·환불·출금·제안·찜 값내림. 문구는 kind → i18n. 20건씩 더보기
export default async function MyNotifications(props: { searchParams: Promise<{ page?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage/notifications");
  const lang = viewer.language;
  const { n, limit } = pageLimit(sp.page);
  const res = await supabase.from("notifications").select("id, kind, ref_type, ref_id, data, read_at, created_at")
    .order("created_at", { ascending: false }).limit(limit + 1);
  const all = rows(res as { data: Notif[] | null; error: { code?: string } | null });
  const list = all.slice(0, limit);
  const missing = tableMissing(res.error);
  const fmt = (s: string) => new Date(s).toLocaleString(lang === "ja" ? "ja-JP" : "ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-none md:p-0 md:pb-16">
      <div className="flex items-baseline justify-between">
        <PageTitle>{t(lang, "my.notif.title")}</PageTitle>
        {list.some((x) => !x.read_at) && <NotifReadAll lang={lang} />}
      </div>
      {list.length > 0 ? (
        <ul className="card divide-y divide-tomo-navy/5">
          {list.map((x) => {
            const sub = notifSub(x);
            return (
              <li key={x.id}>
                <NotifItem id={x.id} href={notifHref(x)} unread={!x.read_at}>
                  <span className={`block text-[13px] ${x.read_at ? "text-ink" : "font-bold text-ink"}`}>{notifText(lang, x)}</span>
                  {sub && <span className="block truncate text-[12px] text-ink-soft">{sub}</span>}
                  <span className="tnum block text-[11px] text-ink-faint">{fmt(x.created_at)}</span>
                </NotifItem>
              </li>
            );
          })}
        </ul>
      ) : <Empty text={t(lang, missing ? "my.notif.unavailable" : "my.notif.none")} />}
      <More lang={lang} href={all.length > limit ? `/mypage/notifications?page=${n + 1}` : null} />
    </main>
  );
}
