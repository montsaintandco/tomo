"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { REGIONS } from "@/lib/regions";
import { t, type Lang } from "@/lib/i18n";

export type Trip = { id: string; country: "KR" | "JP"; region: string; start_date: string; end_date: string; note: string };

// 여행 일정 등록/삭제 — 방문 나라는 내 나라의 반대(크로스보더 전용). RLS: 본인 행만
export default function TripForm({ lang, dest, trips }: { lang: Lang; dest: "KR" | "JP"; trips: Trip[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [region, setRegion] = useState(REGIONS[dest][0]);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  const FIELD = "mt-1 w-full rounded-full bg-white px-4 py-3 text-base shadow-soft";

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const supabase = createBrowserSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login?next=/travel"); return; }
    const { error: err } = await supabase.from("trips").insert({
      user_id: user.id, country: dest, region, start_date: start, end_date: end < start ? start : end, note: note.trim(),
    });
    setBusy(false);
    if (err) { setError(t(lang, "trip.fail")); return; }
    setNote("");
    startTransition(() => router.refresh());
  }

  async function remove(id: string) {
    setBusy(true);
    await createBrowserSupabase().from("trips").delete().eq("id", id);
    setBusy(false);
    startTransition(() => router.refresh());
  }

  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(lang === "ja" ? "ja-JP" : "ko-KR", { month: "short", day: "numeric" });

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={add} className="card flex flex-col gap-3 p-4">
        <label className="text-[13px] font-bold text-ink">{t(lang, "trip.dest")}
          <select className={FIELD} value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGIONS[dest].map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[13px] font-bold text-ink">{t(lang, "trip.start")}
            <input type="date" min={today} value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} required className={`tnum ${FIELD}`} />
          </label>
          <label className="text-[13px] font-bold text-ink">{t(lang, "trip.end")}
            <input type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} required className={`tnum ${FIELD}`} />
          </label>
        </div>
        <label className="text-[13px] font-bold text-ink">{t(lang, "trip.note")}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={`${FIELD} font-normal`} />
        </label>
        <button disabled={busy || isPending} className="btn bg-tomo-coral-deep py-3 text-sm text-white">{t(lang, "trip.add")}</button>
        {error && <p role="alert" className="text-sm text-tomo-rose">{error}</p>}
      </form>

      <section>
        <h2 className="mb-2 text-[15px] font-extrabold text-ink">{t(lang, "trip.mine")}</h2>
        {trips.length === 0 ? (
          <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">{t(lang, "trip.none")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {trips.map((tr) => (
              <li key={tr.id} className="card flex items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-ink">{tr.region}</span>
                  <span className="tnum block text-[12px] text-ink-soft">{fmt(tr.start_date)} – {fmt(tr.end_date)}{tr.note && ` · ${tr.note}`}</span>
                </span>
                <button type="button" onClick={() => remove(tr.id)} disabled={busy || isPending}
                  className="press shrink-0 text-[12px] text-ink-faint underline underline-offset-2 hover:text-tomo-rose">
                  {t(lang, "trip.delete")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
