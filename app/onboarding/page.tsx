"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { REGIONS } from "@/lib/regions";

export default function OnboardingPage() {
  const [nickname, setNickname] = useState("");
  const [country, setCountry] = useState<"KR" | "JP">("KR");
  const [region, setRegion] = useState(REGIONS.KR[0]);
  const [language, setLanguage] = useState<"ko" | "ja">("ko");
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createBrowserSupabase();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return router.replace("/login");
      const { data: p } = await supabase.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
      if (p) router.replace("/");
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").insert({
      id: data.user!.id, nickname, country, region, language,
    });
    if (error) return setError(error.message);
    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="font-brand text-xl text-tomo-navy">프로필 만들기 · プロフィール作成</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="ob-nickname" className="sr-only">닉네임 · ニックネーム</label>
        <input id="ob-nickname" className="rounded-full bg-white px-4 py-3 shadow-[var(--shadow-soft)]" placeholder="닉네임 · ニックネーム" value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={20} />
        <div className="flex gap-2" role="group" aria-label="국가 · 国">
          {/* 나라 선택 — 파스텔 필드에는 딥 잉크 텍스트 (KR=네이비, JP=로즈) */}
          {(["KR", "JP"] as const).map((c) => (
            <button type="button" key={c} aria-pressed={country === c}
              className={`btn flex-1 py-3 ${country === c
                ? (c === "KR" ? "bg-tomo-blue/40 text-tomo-navy shadow-[var(--shadow-soft)]" : "bg-tomo-pink/45 text-tomo-rose shadow-[var(--shadow-soft)]")
                : "bg-white text-ink-soft"}`}
              onClick={() => { setCountry(c); setRegion(REGIONS[c][0]); setLanguage(c === "KR" ? "ko" : "ja"); }}>
              {c === "KR" ? "한국" : "日本"}
            </button>
          ))}
        </div>
        <label htmlFor="ob-region" className="sr-only">지역 · 地域</label>
        <select id="ob-region" className="rounded-full bg-white px-4 py-3 shadow-[var(--shadow-soft)]" value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS[country].map((r) => <option key={r}>{r}</option>)}
        </select>
        <label htmlFor="ob-language" className="sr-only">언어 · 言語</label>
        <select id="ob-language" className="rounded-full bg-white px-4 py-3 shadow-[var(--shadow-soft)]" value={language} onChange={(e) => setLanguage(e.target.value as "ko" | "ja")}>
          <option value="ko">한국어</option>
          <option value="ja">日本語</option>
        </select>
        <button className="btn bg-tomo-coral-deep py-3 text-white">완료 · 完了</button>
        {error && <p role="alert" className="text-sm text-tomo-rose">{error}</p>}
      </form>
    </main>
  );
}
