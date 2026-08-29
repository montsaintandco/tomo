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
        const { error } = await supabase.auth.signUp({ email, password });
        if (!error) return router.push("/onboarding");
        if (/already registered|already exists|user already/i.test(error.message))
          return setError("이미 가입된 이메일이에요. 로그인 탭에서 로그인해 주세요 · 登録済みのメールです");
        setError(error.message);
      }
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
      <div className="flex gap-1.5" role="tablist" aria-label="로그인 방식">
        {MODES.map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={mode === v}
            className={`press flex-1 rounded-full py-2 text-sm font-bold transition-colors ${
              mode === v ? "bg-tomo-navy text-white shadow-[var(--shadow-soft)]" : "bg-white text-ink-soft"}`}
            onClick={() => { setMode(v); setError(""); }}>
            {l}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="auth-email" className="sr-only">이메일 · メールアドレス</label>
        <input id="auth-email" className="rounded-full bg-white px-4 py-3 shadow-[var(--shadow-soft)]" type="email" autoComplete="email"
          placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="auth-password" className="sr-only">비밀번호 · パスワード</label>
        <input id="auth-password" className="rounded-full bg-white px-4 py-3 shadow-[var(--shadow-soft)]" type="password"
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
