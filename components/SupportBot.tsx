"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NODES, ROOT, GREETING, PICK, MORE, type Lang } from "@/lib/support-tree";
import { t } from "@/lib/i18n";

// 지원 봇 — 사조(채널톡 봇) 답변 구조: 봇 말풍선(인사+안내) → 대분류 버튼 → 질문 버튼 → 답변 말풍선 + "추가 질문?" + 관련 질문·바로가기·상담원 연결·처음으로.
// "상담원 연결"도 사조처럼 바로 사람이 아니라 폼 카드(주문 전: 상품 URL·옵션·수량·내용 / 주문 후: 주문·내용 / 그 외: 내용) → 접수 → 마이페이지 문의에서 답변.
// 버튼을 누르면 내 말풍선으로 남고 다음 봇 말풍선이 붙는다. 스크립트 트리라 서버·LLM 없음
type Msg = { who: "bot" | "me"; lines: string[]; link?: { href: string; label: string }; form?: true };
type Cat = "before" | "after" | "sell" | "travel";

export default function SupportBot({ lang, compact = false, loggedIn = true }: { lang: Lang; compact?: boolean; loggedIn?: boolean }) {
  const L = lang === "ja" ? 1 : 0;
  const [msgs, setMsgs] = useState<Msg[]>([{ who: "bot", lines: GREETING[L] }, { who: "bot", lines: [PICK[L]] }]);
  const [choices, setChoices] = useState<string[]>(ROOT);
  const [stack, setStack] = useState<string[]>([]); // 현재 위치(대분류/질문) — 이전으로
  const [form, setForm] = useState<{ cat: Cat } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs, form]);

  function pick(id: string) {
    const n = NODES[id];
    const me: Msg = { who: "me", lines: [n.label[L]] };
    if (n.answer) {
      const bot: Msg = { who: "bot", lines: n.answer[L], link: n.link ? { href: n.link.href, label: n.link.label[L] } : undefined };
      setMsgs((m) => [...m, me, bot, { who: "bot", lines: [MORE[L]] }]);
      setChoices(n.related ?? []);
    } else {
      setMsgs((m) => [...m, me, { who: "bot", lines: [PICK[L]] }]);
      setChoices(n.children ?? []);
    }
    setStack((s) => [...s, id]); setForm(null);
  }
  function back() {
    const parentId = stack.length >= 2 ? stack[stack.length - 2] : null;
    const parent = parentId ? NODES[parentId] : null;
    setMsgs((m) => [...m, { who: "me", lines: [t(lang, "support.back")] }, { who: "bot", lines: [PICK[L]] }]);
    setChoices(parent?.children ?? parent?.related ?? ROOT);
    setStack((s) => s.slice(0, -1)); setForm(null);
  }
  function home() {
    setMsgs((m) => [...m, { who: "me", lines: [t(lang, "support.home")] }, { who: "bot", lines: [PICK[L]] }]);
    setChoices(ROOT); setStack([]); setForm(null);
  }
  function agent() {
    const cat = (ROOT.includes(stack[0]) ? stack[0] : "before") as Cat;
    setMsgs((m) => [...m, { who: "me", lines: [t(lang, "support.agent")] },
      loggedIn ? { who: "bot", lines: [t(lang, `support.form.${cat}` as "support.form.before")], form: true }
               : { who: "bot", lines: [t(lang, "support.loginFirst")], link: { href: "/login?next=/help", label: t(lang, "nav.login") } }]);
    setChoices([]); setForm(loggedIn ? { cat } : null);
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = { category: form!.cat, body: fd.get("body"), itemUrl: fd.get("itemUrl"), itemOption: fd.get("itemOption"), quantity: fd.get("quantity"), orderRef: fd.get("orderRef") };
    const res = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const ok = res.ok;
    setMsgs((m) => [...m.filter((x) => !x.form), { who: "me", lines: [String(fd.get("body") ?? "")] },
      ok ? { who: "bot", lines: [t(lang, "support.received")], link: { href: "/mypage#support", label: t(lang, "support.myTickets") } }
         : { who: "bot", lines: [t(lang, "support.failed")] }]);
    setForm(null); setChoices(ROOT); setStack([]);
  }

  const field = "w-full rounded-[6px] border border-tomo-navy/15 bg-white px-2.5 py-2 text-base placeholder:text-ink-faint md:text-[13px]";
  return (
    <div className={`flex flex-col ${compact ? "h-[min(70dvh,560px)]" : "max-h-[70dvh]"}`}>{/* 패널은 고정 높이, 인라인은 내용만큼(최대 70dvh 스크롤) */}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.who === "me" ? "justify-end" : "justify-start"}`}>
            <div className={`chat-bubble ${m.form ? "w-full" : "max-w-[85%]"} px-3.5 py-2.5 text-[13px] leading-relaxed ${m.who === "me" ? "chat-bubble-mine bg-tomo-coral-deep/10 text-ink" : "chat-bubble-theirs bg-tomo-navy/5 text-ink"}`}>
              {m.lines.map((line, j) => <p key={j} className={j > 0 ? "mt-1.5" : ""}>{line}</p>)}
              {m.link && <Link href={m.link.href} className="btn mt-2.5 inline-block bg-tomo-navy px-3 py-1.5 text-[12px] text-white">{m.link.label} →</Link>}
              {m.form && form && (
                <form onSubmit={submit} className="mt-2.5 flex flex-col gap-2">
                  {form.cat === "before" && (
                    <>
                      <input name="itemUrl" type="url" required placeholder={t(lang, "support.f.url")} className={field} />
                      <div className="flex gap-2">
                        <input name="itemOption" placeholder={t(lang, "support.f.option")} className={field} />
                        <input name="quantity" type="number" inputMode="numeric" min={1} max={999} placeholder={t(lang, "support.f.qty")} className={`${field} w-24 shrink-0`} />
                      </div>
                    </>
                  )}
                  {form.cat === "after" && <input name="orderRef" required placeholder={t(lang, "support.f.order")} className={field} />}
                  <textarea name="body" required rows={3} maxLength={2000} placeholder={t(lang, "support.f.body")} className={field} />
                  <button type="submit" className="btn self-end bg-tomo-navy px-4 py-2 text-[13px] text-white">{t(lang, "support.f.send")}</button>
                </form>
              )}
            </div>
          </div>
        ))}
        {/* 빠른 답변 버튼 — 사조처럼 마지막 봇 말풍선 아래 오른쪽 정렬 칩 */}
        {!form && (
          <div className="flex flex-wrap justify-end gap-1.5 pt-1">
            {choices.map((id) => (
              <button key={id} type="button" onClick={() => pick(id)} className="press rounded-full border border-tomo-navy/15 bg-white px-3 py-1.5 text-[13px] font-bold text-ink fine:hover:bg-tomo-navy/5">{NODES[id].label[L]}</button>
            ))}
            <button type="button" onClick={agent} className="press rounded-full border border-tomo-coral-deep/30 bg-white px-3 py-1.5 text-[13px] font-bold text-tomo-coral-deep">{t(lang, "support.agent")}</button>
            {stack.length > 0 && <button type="button" onClick={back} className="press rounded-full border border-tomo-navy/15 bg-white px-3 py-1.5 text-[13px] font-bold text-ink-soft">{t(lang, "support.back")}</button>}
            {stack.length > 0 && <button type="button" onClick={home} className="press rounded-full border border-tomo-navy/15 bg-white px-3 py-1.5 text-[13px] font-bold text-ink-soft">{t(lang, "support.home")}</button>}
          </div>
        )}
        {form && <div className="flex justify-end pt-1"><button type="button" onClick={home} className="press rounded-full border border-tomo-navy/15 bg-white px-3 py-1.5 text-[13px] font-bold text-ink-soft">{t(lang, "support.home")}</button></div>}
        <div ref={endRef} />
      </div>
    </div>
  );
}
