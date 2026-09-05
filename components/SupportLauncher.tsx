"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SupportBot from "@/components/SupportBot";
import PushToggle from "@/components/PushToggle";
import { Wordmark } from "@/components/Brand";
import { t, type Lang } from "@/lib/i18n";

// 플로팅 문의 패널 — 사조(채널톡 메신저) 첫 화면 구조 그대로: 홈(브랜드·인사 미리보기·"문의하기" CTA) / 대화(내 문의 목록·새 문의) / 설정(언어·알림·연락처).
// 문의하기를 누르면 봇 채팅으로. 채팅방·인증·어드민·고객센터(인라인 봇)에서는 숨김
type Tab = "home" | "chat" | "settings";
type Ticket = { id: string; category: string; body: string; status: string; reply: string | null; created_at: string };

export default function SupportLauncher({ lang, loggedIn }: { lang: Lang; loggedIn: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [botOpen, setBotOpen] = useState(false);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [open, setOpen] = useState(false);

  // 대화 탭을 열 때만 내 문의를 가져온다 (게스트는 401 → null)
  useEffect(() => {
    if (!open || tab !== "chat" || !loggedIn || tickets) return;
    fetch("/api/support/tickets").then((r) => r.json()).then((j) => setTickets(j.tickets ?? [])).catch(() => setTickets([]));
  }, [open, tab, loggedIn, tickets]);

  if (/^\/(login|onboarding|admin|help)/.test(path) || /^\/chat\/./.test(path)) return null;

  const show = () => { setOpen(true); setTab("home"); setBotOpen(false); ref.current?.showModal(); };
  const close = () => { ref.current?.close(); setOpen(false); };
  const setLang = (next: Lang) => { if (next === lang) return; document.cookie = `tomo_lang=${next}; path=/; max-age=31536000; samesite=lax`; router.refresh(); };
  const tabBtn = (id: Tab, label: string, icon: React.ReactNode) => (
    <button type="button" onClick={() => { setTab(id); setBotOpen(false); }} aria-current={tab === id ? "page" : undefined}
      className={`press flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${tab === id ? "text-tomo-coral-deep" : "text-ink-soft"}`}>
      {icon}{label}
    </button>
  );
  const STATUS: Record<string, string> = { open: t(lang, "my.supportOpen"), answered: t(lang, "my.supportAnswered"), closed: t(lang, "my.supportClosed") };

  return (
    <>
      <button type="button" onClick={show} aria-label={t(lang, "support.title")}
        className="press fixed bottom-4 right-4 z-30 flex h-12 items-center gap-2 rounded-full bg-tomo-navy pl-4 pr-5 text-sm font-bold text-white shadow-lift standalone:bottom-[74px] md:bottom-6 md:right-6">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden><path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" /></svg>
        {t(lang, "support.cta")}
      </button>

      <dialog ref={ref} onClose={() => setOpen(false)} aria-label={t(lang, "support.title")}
        className="sheet m-0 mt-auto flex w-full max-w-md flex-col rounded-t-card bg-white p-0 shadow-lift backdrop:bg-tomo-navy/40 md:bottom-6 md:left-auto md:right-6 md:top-auto md:mt-0 md:h-[600px] md:w-[400px] md:rounded-card">
        {/* 헤더 — 봇 채팅 중에는 뒤로가기, 그 외엔 탭 제목 */}
        <div className="flex items-center justify-between border-b border-tomo-navy/10 px-3 py-2.5">
          <div className="flex items-center gap-1">
            {botOpen ? (
              <button type="button" onClick={() => setBotOpen(false)} aria-label={t(lang, "support.back")} className="press flex h-9 w-9 items-center justify-center rounded-full text-ink-soft fine:hover:bg-tomo-navy/5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
              </button>
            ) : <span className="w-1" />}
            <div>
              <p className="text-[15px] font-extrabold text-ink">{botOpen ? "TOMO" : t(lang, tab === "home" ? "support.title" : tab === "chat" ? "support.tabChat" : "support.tabSettings")}</p>
              {botOpen && <p className="text-[11px] text-ink-soft">{t(lang, "support.sub")}</p>}
            </div>
          </div>
          <button type="button" onClick={close} aria-label={t(lang, "support.close")} className="press flex h-9 w-9 items-center justify-center rounded-full text-ink-soft fine:hover:bg-tomo-navy/5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {botOpen ? (
            <SupportBot lang={lang} compact loggedIn={loggedIn} />
          ) : tab === "home" ? (
            <div className="flex flex-col gap-4 p-4">
              {/* 사조 홈: 커버 + 브랜드 + 인사 미리보기 + 큰 CTA. 운영시간은 정해진 게 없어 적지 않는다 */}
              <div className="rounded-card bg-[#eef2ff] px-4 py-5">
                <Wordmark className="text-xl" />
                <p className="mt-1 text-[13px] text-ink-soft">{t(lang, "footer.thesis")}</p>
              </div>
              <div className="flex gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tomo-navy text-[11px] font-extrabold text-white" aria-hidden>T</span>
                <div className="chat-bubble chat-bubble-theirs bg-tomo-navy/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
                  <p className="text-[11px] font-bold text-ink-soft">TOMO bot</p>
                  <p className="mt-0.5">{t(lang, "support.homeHello")}</p>
                  <p className="mt-1 line-clamp-2 text-ink-soft">{t(lang, "support.homeHint")}</p>
                </div>
              </div>
              <button type="button" onClick={() => setBotOpen(true)} className="btn w-full bg-tomo-coral-deep py-3.5 text-[15px] text-white">{t(lang, "support.ask")} ▾</button>
              <p className="text-center text-[11px] text-ink-faint">{t(lang, "support.homeNote")}</p>
            </div>
          ) : tab === "chat" ? (
            <div className="flex flex-col gap-2 p-4">
              {!loggedIn ? (
                <div className="rounded-card bg-tomo-navy/5 p-3.5 text-[13px] text-ink">
                  <p>{t(lang, "support.loginFirst")}</p>
                  <Link href={`/login?next=${encodeURIComponent(path)}`} className="btn mt-2.5 inline-block bg-tomo-navy px-3 py-1.5 text-[12px] text-white">{t(lang, "nav.login")} →</Link>
                </div>
              ) : tickets === null ? (
                <div className="skeleton h-16 rounded-card" aria-hidden />
              ) : tickets.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-ink-soft">{t(lang, "my.noSupport")}</p>
              ) : tickets.map((k) => (
                <div key={k.id} className="rounded-card border border-tomo-navy/10 p-3 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink-soft"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-tomo-navy text-[9px] font-extrabold text-white" aria-hidden>T</span>TOMO · {new Date(k.created_at).toLocaleDateString(lang === "ja" ? "ja-JP" : "ko-KR")}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${k.status === "open" ? "bg-tomo-coral-deep/10 text-tomo-coral-deep" : "bg-tomo-navy/5 text-ink-soft"}`}>{STATUS[k.status] ?? k.status}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-ink">{k.body}</p>
                  {k.reply && <p className="mt-1.5 line-clamp-3 rounded-[6px] bg-tomo-navy/5 px-2.5 py-2 text-ink">{k.reply}</p>}
                </div>
              ))}
              <button type="button" onClick={() => setBotOpen(true)} className="btn mt-2 w-full bg-tomo-navy py-3 text-sm text-white">{t(lang, "support.newTicket")}</button>
            </div>
          ) : (
            <div className="flex flex-col gap-5 p-4 text-[13px]">
              <section>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{t(lang, "support.contactInfo")}</h3>
                {loggedIn
                  ? <Link href="/mypage/edit" className="mt-2 flex items-center justify-between rounded-card border border-tomo-navy/10 px-3.5 py-3 text-ink">{t(lang, "support.editProfile")}<span aria-hidden>›</span></Link>
                  : <Link href={`/login?next=${encodeURIComponent(path)}`} className="mt-2 flex items-center justify-between rounded-card border border-tomo-navy/10 px-3.5 py-3 text-ink">{t(lang, "nav.login")}<span aria-hidden>›</span></Link>}
              </section>
              <section>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{t(lang, "support.env")}</h3>
                <div className="mt-2 divide-y divide-tomo-navy/10 rounded-card border border-tomo-navy/10">
                  <div className="flex items-center justify-between px-3.5 py-3">
                    <span className="text-ink">{t(lang, "support.language")}</span>
                    <div role="group" className="flex gap-1">
                      {(["ko", "ja"] as Lang[]).map((v) => (
                        <button key={v} type="button" onClick={() => setLang(v)} aria-pressed={lang === v}
                          className={`press rounded-[4px] px-2 py-1 text-[11px] font-bold ${lang === v ? "bg-tomo-navy text-white" : "bg-tomo-navy/5 text-ink-soft"}`}>{v === "ko" ? "KR 한국어" : "JP 日本語"}</button>
                      ))}
                    </div>
                  </div>
                  {loggedIn && <div className="px-3.5 py-3"><PushToggle lang={lang} /></div>}
                </div>
              </section>
              <p className="text-center text-[11px] text-ink-faint">TOMO · {t(lang, "footer.tagline")}</p>
            </div>
          )}
        </div>

        {/* 하단 탭 — 홈 / 대화 / 설정 */}
        {!botOpen && (
          <nav className="flex border-t border-tomo-navy/10 pb-[env(safe-area-inset-bottom)]" aria-label={t(lang, "support.title")}>
            {tabBtn("home", t(lang, "support.tabHome"), <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden><path d="M3.5 11 12 4l8.5 7v9h-6v-6h-5v6h-6z" /></svg>)}
            {tabBtn("chat", t(lang, "support.tabChat"), <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden><path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" /></svg>)}
            {tabBtn("settings", t(lang, "support.tabSettings"), <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5A7 7 0 0 0 19 12z" /></svg>)}
          </nav>
        )}
      </dialog>
    </>
  );
}
