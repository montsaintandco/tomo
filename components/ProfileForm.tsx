"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { REGIONS } from "@/lib/regions";
import { t, type Lang } from "@/lib/i18n";

// 프로필 편집 — 닉네임·지역·언어만 (나라는 통화·마켓과 묶여 있어 고정. 0003 grant와 동일 범위)
export default function ProfileForm({ lang, initial }: {
  lang: Lang; initial: { nickname: string; country: "KR" | "JP"; region: string; language: Lang };
}) {
  const [nickname, setNickname] = useState(initial.nickname);
  const [region, setRegion] = useState(initial.region);
  const [language, setLanguage] = useState<Lang>(initial.language);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const FIELD = "rounded-full bg-white px-4 py-3 text-base shadow-soft placeholder:text-ink-soft";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setMsg("");
    const supabase = createBrowserSupabase();
    const { data } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("profiles")
      .update({ nickname: nickname.trim(), region, language }).eq("id", data.user!.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    document.cookie = `tomo_lang=${language}; path=/; max-age=31536000; samesite=lax`;
    setMsg(t(lang, "pf.saved"));
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="text-[13px] font-bold text-ink">{t(lang, "ob.nickname")}
        <input className={`mt-1 w-full ${FIELD}`} value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={20} autoComplete="nickname" />
      </label>
      <label className="text-[13px] font-bold text-ink">{t(lang, "ob.region")}
        <select className={`mt-1 w-full ${FIELD}`} value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS[initial.country].map((r) => <option key={r}>{r}</option>)}
        </select>
      </label>
      <label className="text-[13px] font-bold text-ink">{t(lang, "ob.language")}
        <select className={`mt-1 w-full ${FIELD}`} value={language} onChange={(e) => setLanguage(e.target.value as Lang)}>
          <option value="ko">{t(lang, "lang.ko")}</option>
          <option value="ja">{t(lang, "lang.ja")}</option>
        </select>
      </label>
      <button disabled={busy} className="btn bg-tomo-coral-deep py-3 text-sm text-white">
        {busy ? t(lang, "auth.wait") : t(lang, "pf.save")}
      </button>
      {msg && <p role="status" className="text-sm text-tomo-navy">{msg}</p>}
      {error && <p role="alert" className="text-sm text-tomo-rose">{error}</p>}
    </form>
  );
}
