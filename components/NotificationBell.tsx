"use client";
// 헤더 벨 + 알림함 클라이언트 조각. 알림(0027)이 없거나 조회 오류면 count = -1 → 벨을 숨긴다.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

export default function NotificationBell({ lang, count, active = false, className = "" }: {
  lang: Lang; count: number; active?: boolean; className?: string;
}) {
  if (count < 0) return null;
  return (
    <Link href="/mypage/notifications" aria-current={active ? "page" : undefined}
      aria-label={count > 0 ? t(lang, "my.notif.unread", { n: count }) : t(lang, "my.notif.title")}
      className={`press relative flex h-11 w-9 items-center justify-center rounded-full md:w-10 ${active ? "text-tomo-navy" : "text-ink-soft hover:text-ink"} ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.1 : 1.7} strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden>
        <path d="M6 10a6 6 0 0 1 12 0c0 4.5 1.8 6 1.8 6H4.2S6 14.5 6 10z" /><path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
      </svg>
      {count > 0 && (
        <span className="tnum absolute -right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-tomo-coral-deep px-1 text-[11px] font-bold text-white">{count > 9 ? "9+" : count}</span>
      )}
    </Link>
  );
}

/** 알림함 한 줄 — 누르면 읽음 처리(기다리지 않음) 후 이동 */
export function NotifItem({ id, href, unread, children }: { id: number; href: string; unread: boolean; children: React.ReactNode }) {
  return (
    <Link href={href}
      onClick={() => { if (unread) void createBrowserSupabase().rpc("mark_notifications_read", { p_ids: [id] }); }}
      className={`press flex items-start gap-2.5 px-4 py-3 ${unread ? "" : "opacity-70"}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-tomo-coral-deep" : "bg-transparent"}`} aria-hidden />
      <span className="min-w-0 flex-1">{children}</span>
    </Link>
  );
}

export function NotifReadAll({ lang }: { lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  async function go() {
    setBusy(true);
    await createBrowserSupabase().rpc("mark_notifications_read", { p_ids: null });
    setBusy(false);
    start(() => router.refresh());
  }
  return (
    <button type="button" onClick={go} disabled={busy || pending} className="press text-[13px] font-bold text-tomo-navy disabled:opacity-45">
      {t(lang, "my.notif.readAll")}
    </button>
  );
}
