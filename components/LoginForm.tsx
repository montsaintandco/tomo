"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Wordmark } from "@/components/Brand";
import { t, type Lang } from "@/lib/i18n";

type Mode = "signin" | "signup";

export default function LoginForm({ lang }: { lang: Lang }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const next = useSearchParams().get("next");
  // 온보딩이 미완이면 보호 경로 진입 시 미들웨어가 다시 온보딩으로 보냄
  const dest = next && next.startsWith("/") ? next : "/onboarding";

  // 구글 OAuth — 콜백에서 세션 교환 후 dest로 (신규 유저는 온보딩이 받는다)
  async function googleLogin() {
    setError(""); setBusy(true);
    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(dest)}`,
        skipBrowserRedirect: true,
      },
    });
    if (error || !data?.url) {
      setError(error?.message ?? t(lang, "auth.googleFail"));
      setBusy(false);
      return;
    }
    // 프로바이더 미설정이면 400 JSON 페이지로 떨어지므로 먼저 확인 (설정돼 있으면 redirect라 status 0)
    const probe = await fetch(data.url, { redirect: "manual" }).catch(() => null);
    if (probe?.status === 400) {
      setError(t(lang, "auth.googlePending"));
      setBusy(false);
      return;
    }
    window.location.assign(data.url);
  }

  // 의도를 명시적으로: 로그인 실패가 조용히 신규 가입으로 흐르지 않는다
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    const supabase = createBrowserSupabase();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (!error) return router.push(dest);
        if (/invalid login credentials/i.test(error.message)) return setError(t(lang, "auth.errInvalid"));
        setError(error.message);
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (!error) {
          // 이메일 인증이 켜진 프로젝트면 세션 없이 성공 — 온보딩으로 보내면 로그인으로 튕기므로 안내
          if (!data.session) return setError(t(lang, "auth.errConfirm"));
          return router.push("/onboarding");
        }
        if (/already registered|already exists|user already/i.test(error.message)) return setError(t(lang, "auth.errExists"));
        if (/rate limit/i.test(error.message)) return setError(t(lang, "auth.errRate"));
        setError(error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "auth.errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  const modes: [Mode, string][] = [["signin", t(lang, "auth.signin")], ["signup", t(lang, "auth.signup")]];

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <div className="mb-1 flex flex-col items-center gap-1">
        <Wordmark className="text-3xl" />
        <p className="text-xs text-ink-soft">{t(lang, "footer.tagline")}</p>
      </div>
      <button type="button" onClick={googleLogin} disabled={busy}
        className="btn flex items-center justify-center gap-2.5 bg-white py-3 text-sm text-ink shadow-soft">
        {/* 구글 공식 4색 G 로고 */}
        <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden>
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
        </svg>
        {t(lang, "auth.google")}
      </button>
      <p className="text-center text-[11px] text-ink-soft">{t(lang, "auth.or")}</p>
      <div className="flex gap-1.5" role="tablist" aria-label={t(lang, "auth.modeAria")}>
        {modes.map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={mode === v}
            className={`press flex-1 rounded-full py-3 text-[13px] font-bold transition-colors ${
              mode === v ? "bg-tomo-navy text-white shadow-soft" : "bg-white text-ink-soft"}`}
            onClick={() => { setMode(v); setError(""); }}>
            {l}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="auth-email" className="sr-only">{t(lang, "auth.email")}</label>
        <input id="auth-email" className="rounded-full bg-white px-4 py-3 text-base shadow-soft placeholder:text-ink-soft" type="email" autoComplete="email"
          placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="auth-password" className="sr-only">{t(lang, "auth.password")}</label>
        <input id="auth-password" className="rounded-full bg-white px-4 py-3 text-base shadow-soft placeholder:text-ink-soft" type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder={t(lang, "auth.passwordHint")} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <button disabled={busy} className="btn bg-tomo-coral-deep py-3 text-sm text-white">
          {busy ? t(lang, "auth.wait") : mode === "signin" ? t(lang, "auth.signin") : t(lang, "auth.signupCta")}
        </button>
        {error && <p role="alert" className="text-sm text-tomo-rose">{error}</p>}
      </form>
    </main>
  );
}
