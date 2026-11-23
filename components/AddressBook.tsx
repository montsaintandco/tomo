"use client";
// 주소록(0028 addresses) — 추가·수정·삭제·기본 지정. 한국 회원은 개인통관고유부호 칸이 보인다(형식 P+숫자 12자리, DB check 와 같음).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

export type Addr = { id: string; label: string; name: string; phone: string; postal: string; address: string; note: string; pccc: string | null; is_default: boolean };
type Draft = { label: string; name: string; phone: string; postal: string; address: string; note: string; pccc: string };
const EMPTY: Draft = { label: "", name: "", phone: "", postal: "", address: "", note: "", pccc: "" };
const PCCC_RE = /^P[0-9]{12}$/;

const input = "mt-1 w-full rounded-full bg-white px-4 py-2.5 text-base font-normal shadow-soft placeholder:text-ink-soft";

export default function AddressBook({ lang, initial, showPccc }: { lang: Lang; initial: Addr[]; showPccc: boolean }) {
  const [editing, setEditing] = useState<string | null>(null); // 주소 id 또는 "new"
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const done = () => { setBusy(false); setEditing(null); start(() => router.refresh()); };
  const fail = (msg?: string) => {
    setBusy(false);
    setError(msg?.includes("address limit") ? t(lang, "addr.limit") : msg?.includes("pccc") ? t(lang, "addr.pcccInvalid") : t(lang, "addr.fail"));
  };

  function open(a?: Addr) {
    setError("");
    setEditing(a ? a.id : "new");
    setDraft(a ? { label: a.label, name: a.name, phone: a.phone, postal: a.postal, address: a.address, note: a.note, pccc: a.pccc ?? "" } : EMPTY);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const pccc = draft.pccc.trim().toUpperCase();
    if (pccc && !PCCC_RE.test(pccc)) { setError(t(lang, "addr.pcccInvalid")); return; }
    setBusy(true); setError("");
    const sb = createBrowserSupabase();
    const row = { label: draft.label.trim(), name: draft.name.trim(), phone: draft.phone.trim(), postal: draft.postal.trim(),
      address: draft.address.trim(), note: draft.note.trim(), pccc: pccc || null };
    if (editing === "new") {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return fail();
      const { data, error: err } = await sb.from("addresses").insert({ ...row, user_id: user.id }).select("id").single();
      if (err || !data) return fail(err?.message);
      if (initial.length === 0) await sb.rpc("set_default_address", { p_id: data.id }); // 첫 주소 = 기본
    } else if (editing) {
      const { error: err } = await sb.from("addresses").update(row).eq("id", editing);
      if (err) return fail(err.message);
      if (initial.find((a) => a.id === editing)?.is_default) await sb.rpc("set_default_address", { p_id: editing }); // 프로필 사본 갱신
    }
    done();
  }

  async function remove(a: Addr) {
    if (!confirm(t(lang, "addr.deleteConfirm"))) return;
    setBusy(true); setError("");
    const sb = createBrowserSupabase();
    const { error: err } = await sb.from("addresses").delete().eq("id", a.id);
    if (err) return fail(err.message);
    const next = initial.find((x) => x.id !== a.id);
    if (a.is_default && next) await sb.rpc("set_default_address", { p_id: next.id });
    done();
  }

  async function makeDefault(a: Addr) {
    setBusy(true); setError("");
    const { error: err } = await createBrowserSupabase().rpc("set_default_address", { p_id: a.id });
    if (err) return fail(err.message);
    done();
  }

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const field = (k: keyof Draft, label: string, opts: { required?: boolean; type?: string; auto?: string; hint?: string } = {}) => (
    <label className="block text-[12px] font-bold text-ink">{label}
      <input type={opts.type ?? "text"} value={draft[k]} onChange={set(k)} required={opts.required ?? true} autoComplete={opts.auto} className={input} />
      {opts.hint && <span className="mt-1 block text-[11px] font-normal text-ink-soft">{opts.hint}</span>}
    </label>
  );
  const form = (
    <form onSubmit={save} className="card flex flex-col gap-3 p-4">
      {field("label", t(lang, "addr.label"), { required: false })}
      {field("name", t(lang, "order.name"), { auto: "name" })}
      {field("phone", t(lang, "order.phone"), { type: "tel", auto: "tel" })}
      {field("postal", t(lang, "order.postal"), { auto: "postal-code" })}
      {field("address", t(lang, "order.addressLine"), { auto: "street-address" })}
      {field("note", t(lang, "order.shipNote"), { required: false })}
      {showPccc && field("pccc", t(lang, "addr.pccc"), { required: false, hint: t(lang, "addr.pcccHint") })}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn flex-1 bg-tomo-coral-deep py-2.5 text-sm text-white disabled:opacity-45">{t(lang, "addr.save")}</button>
        <button type="button" onClick={() => setEditing(null)} className="btn flex-1 bg-tomo-navy/5 py-2.5 text-sm text-ink">{t(lang, "addr.cancel")}</button>
      </div>
    </form>
  );

  return (
    <div className="flex flex-col gap-2">
      {initial.map((a) => editing === a.id ? <div key={a.id}>{form}</div> : (
        <div key={a.id} className="card p-3.5 text-[13px]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-ink">{a.label || a.name}</span>
            {a.is_default && <span className="rounded-full bg-tomo-coral-deep/10 px-2 py-0.5 text-[11px] font-bold text-tomo-coral-deep">{t(lang, "addr.default")}</span>}
          </div>
          <p className="mt-1 text-ink">{a.name} · {a.phone}</p>
          <p className="text-ink-soft">({a.postal}) {a.address}</p>
          {a.note && <p className="text-[12px] text-ink-soft">{a.note}</p>}
          {showPccc && a.pccc && <p className="tnum text-[12px] text-ink-soft">{t(lang, "addr.pccc")} {a.pccc.slice(0, 3)}••••••{a.pccc.slice(-4)}</p>}
          <div className="mt-2 flex gap-3 text-[12px] font-bold">
            <button type="button" onClick={() => open(a)} disabled={busy || pending} className="press min-h-9 text-tomo-navy">{t(lang, "addr.edit")}</button>
            {!a.is_default && <button type="button" onClick={() => makeDefault(a)} disabled={busy || pending} className="press min-h-9 text-tomo-navy">{t(lang, "addr.setDefault")}</button>}
            <button type="button" onClick={() => remove(a)} disabled={busy || pending} className="press ml-auto min-h-9 text-ink-faint hover:text-tomo-rose">{t(lang, "addr.delete")}</button>
          </div>
        </div>
      ))}
      {initial.length === 0 && editing !== "new" && <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">{t(lang, "addr.none")}</p>}
      {editing === "new" ? form : initial.length < 10 && (
        <button type="button" onClick={() => open()} className="btn mt-1 border-[1.5px] border-tomo-navy bg-white py-2.5 text-sm text-tomo-navy">{t(lang, "addr.add")}</button>
      )}
      {error && <p role="alert" className="text-center text-[12px] text-tomo-rose">{error}</p>}
    </div>
  );
}
