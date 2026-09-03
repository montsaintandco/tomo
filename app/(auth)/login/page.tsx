"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Wordmark } from "@/components/Brand";

// useSearchParams는 Suspense 경계 안에서만 프리렌더 가능
export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

const MODES = [["signin", "로그인 · ログイン"], ["signup", "회원가입 · 新規登録"]] as const;
type Mode = (typeof MODES)[number][0];

function LoginForm() {
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
      setError(error?.message ?? "구글 로그인 시작 실패 · Googleログインに失敗しました");
      setBusy(false);
      return;
    }
    // 프로바이더 미설정이면 400 JSON 페이지로 떨어지므로 먼저 확인 (설정돼 있으면 redirect라 status 0)
    const probe = await fetch(data.url, { redirect: "manual" }).catch(() => null);
    if (probe?.status === 400) {
      setError("구글 로그인 준비 중이에요 · Googleログイン準備中");
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
        if (/invalid login credentials/i.test(error.message))
          return setError("이메일 또는 비밀번호가 올바르지 않아요. 처음이라면 회원가입을 눌러 주세요 · メールまたはパスワードが正しくありません");
        setError(error.message);
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (!error) {
          // 이메일 인증이 켜진 프로젝트면 세션 없이 성공 — 온보딩으로 보내면 로그인으로 튕기므로 안내
          if (!data.session)
            return setError("가입 확인 메일을 보냈어요. 메일의 링크로 인증한 뒤 로그인해 주세요 · 確認メールのリンクを開いてからログインしてください");
          return router.push("/onboarding");
        }
        if (/already registered|already exists|user already/i.test(error.message))
          return setError("이미 가입된 이메일이에요. 로그인 탭에서 로그인해 주세요 · 登録済みのメールです");
        if (/rate limit/i.test(error.message))
          return setError("지금은 가입 요청이 많아요. 잠시 후 다시 시도해 주세요 · しばらくしてからもう一度お試しください");
        setError(error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청에 실패했어요 · 失敗しました。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <div className="mb-1 flex flex-col items-center gap-1">
        <Wordmark className="text-3xl" />
        <p className="text-xs text-ink-soft">한국과 일본을 잇는 중고마켓 · 韓国と日本をつなぐフリマ</p>
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
        구글로 계속하기 · Googleで続行
      </button>
      <p className="text-center text-[11px] text-ink-soft">또는 이메일로 · またはメールで</p>
      <div className="flex gap-1.5" role="tablist" aria-label="로그인 방식">
        {MODES.map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={mode === v}
            className={`press flex-1 rounded-full py-2 text-sm font-bold transition-colors ${
              mode === v ? "bg-tomo-navy text-white shadow-soft" : "bg-white text-ink-soft"}`}
            onClick={() => { setMode(v); setError(""); }}>
            {l}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="auth-email" className="sr-only">이메일 · メールアドレス</label>
        <input id="auth-email" className="rounded-full bg-white px-4 py-3 shadow-soft" type="email" autoComplete="email"
          placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="auth-password" className="sr-only">비밀번호 · パスワード</label>
        <input id="auth-password" className="rounded-full bg-white px-4 py-3 shadow-soft" type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder="비밀번호 / パスワード (8자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <button disabled={busy} className="btn bg-tomo-coral-deep py-3 text-white">
          {busy ? "잠시만요…" : mode === "signin" ? "로그인 · ログイン" : "가입하기 · 登録する"}
        </button>
        {error && <p role="alert" className="text-sm text-tomo-rose">{error}</p>}
      </form>
    </main>
  );
}
