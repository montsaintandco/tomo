"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { REGIONS } from "@/lib/regions";
import { t, type Lang } from "@/lib/i18n";
import { Wordmark } from "@/components/Brand";

export default function OnboardingForm({ lang }: { lang: Lang }) {
  const initialCountry = lang === "ja" ? "JP" : "KR";
  const [nickname, setNickname] = useState("");
  const [country, setCountry] = useState<"KR" | "JP">(initialCountry);
  const [region, setRegion] = useState(REGIONS[initialCountry][0]);
  const [language, setLanguage] = useState<Lang>(lang);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return router.replace("/login");
      const { data: p } = await supabase.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
      if (p) router.replace("/");
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const supabase = createBrowserSupabase();
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").insert({
      id: data.user!.id, nickname, country, region, language,
    });
    if (error) { setError(error.message); setBusy(false); return; }
    // UI 언어 쿠키를 프로필 언어에 맞춘다 — 첫 화면부터 한 언어로
    document.cookie = `tomo_lang=${language}; path=/; max-age=31536000; samesite=lax`;
    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <div className="mb-1 flex flex-col items-start gap-1">
        <Wordmark className="text-2xl" />
        <h1 className="mt-2 text-[17px] font-extrabold leading-tight text-ink">{t(lang, "ob.title")}</h1>
        <p className="text-xs text-ink-soft">{t(lang, "ob.sub")}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="ob-nickname" className="sr-only">{t(lang, "ob.nickname")}</label>
        <input id="ob-nickname" className="rounded-full bg-white px-4 py-3 text-base shadow-soft placeholder:text-ink-soft"
          placeholder={t(lang, "ob.nickname")} value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={20} autoComplete="nickname" />
        <div className="flex gap-2" role="group" aria-label={t(lang, "ob.countryAria")}>
          {/* 나라 선택 — 파스텔 필드에는 딥 잉크 텍스트 (KR=네이비, JP=로즈). 나라 색의 정당한 표면 */}
          {(["KR", "JP"] as const).map((c) => (
            <button type="button" key={c} aria-pressed={country === c}
              className={`btn flex-1 py-3 text-sm ${country === c
                ? (c === "KR" ? "bg-tomo-blue/40 text-tomo-navy shadow-soft" : "bg-tomo-pink/45 text-tomo-rose shadow-soft")
                : "bg-white text-ink-soft shadow-soft"}`}
              onClick={() => { setCountry(c); setRegion(REGIONS[c][0]); setLanguage(c === "KR" ? "ko" : "ja"); }}>
              {t(lang, `market.${c}`)}
            </button>
          ))}
        </div>
        <label htmlFor="ob-region" className="sr-only">{t(lang, "ob.region")}</label>
        <select id="ob-region" className="rounded-full bg-white px-4 py-3 text-base shadow-soft" value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS[country].map((r) => <option key={r}>{r}</option>)}
        </select>
        <label htmlFor="ob-language" className="sr-only">{t(lang, "ob.language")}</label>
        <select id="ob-language" className="rounded-full bg-white px-4 py-3 text-base shadow-soft" value={language} onChange={(e) => setLanguage(e.target.value as Lang)}>
          <option value="ko">{t(lang, "lang.ko")}</option>
          <option value="ja">{t(lang, "lang.ja")}</option>
        </select>
        <button disabled={busy} className="btn bg-tomo-coral-deep py-3 text-sm text-white">
          {busy ? t(lang, "auth.wait") : t(lang, "ob.done")}
        </button>
        {error && <p role="alert" className="text-sm text-tomo-rose">{error}</p>}
      </form>
    </main>
  );
}
