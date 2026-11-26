import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { t } from "@/lib/i18n";
import LogoutButton from "@/components/LogoutButton";
import DeactivateButton from "@/components/DeactivateButton";
import PushToggle from "@/components/PushToggle";
import { PageTitle } from "@/components/mypage/MyNav";
import BlockButton from "@/components/safety/BlockButton";
import { rows } from "@/lib/safe";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "설정 · 設定 | TOMO", robots: { index: false } };

// 설정 — 프로필 편집 링크(/mypage/edit 유지)·푸시·로그아웃·탈퇴
export default async function MySettings() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage/settings");
  const lang = viewer.language;
  // 차단한 사용자(0033). 표가 없으면 빈 목록
  const blocked = rows(await supabase.from("blocks")
    .select("blocked_id, profiles!blocks_blocked_id_fkey(nickname)")
    .eq("blocker_id", viewer.id).order("created_at", { ascending: false }).limit(100)) as unknown as
    { blocked_id: string; profiles: { nickname: string } | null }[];
  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-none md:p-0 md:pb-16">
      <PageTitle>{t(lang, "my.nav.settings")}</PageTitle>
      <div className="flex flex-col gap-3">
        <div className="card divide-y divide-tomo-navy/5">
          <Link href="/mypage/edit" className="press flex min-h-12 items-center px-4 text-[14px] text-ink">{t(lang, "my.editProfile")}<span className="ml-auto text-ink-faint" aria-hidden>→</span></Link>
          <Link href={`/profile/${viewer.id}`} className="press flex min-h-12 items-center px-4 text-[14px] text-ink">{t(lang, "my.profileLink")}<span className="ml-auto text-ink-faint" aria-hidden>→</span></Link>
        </div>
        <div className="card p-3.5"><PushToggle lang={lang} /></div>
        <section className="card p-3.5" aria-label={t(lang, "trust.blockedList")}>
          <p className="text-[14px] text-ink">{t(lang, "trust.blockedList")}</p>
          {blocked.length === 0 ? (
            <p className="mt-1 text-[12px] text-ink-soft">{t(lang, "trust.blockedList.empty")}</p>
          ) : (
            <ul className="mt-1 divide-y divide-tomo-navy/5">
              {blocked.map((b) => (
                <li key={b.blocked_id} className="flex items-center justify-between gap-2">
                  <Link href={`/profile/${b.blocked_id}`} className="press min-w-0 truncate text-[13px] text-ink">{b.profiles?.nickname ?? "—"}</Link>
                  <BlockButton userId={b.blocked_id} initialBlocked lang={lang} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="card flex items-center justify-between p-3.5">
          <span className="text-[14px] text-ink">{t(lang, "my.settings.account")}</span>
          <LogoutButton lang={lang} />
        </div>
        <div className="mt-3"><DeactivateButton lang={lang} /></div>
      </div>
    </main>
  );
}
