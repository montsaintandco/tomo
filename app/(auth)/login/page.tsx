"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const supabase = createBrowserSupabase();
    // 기존 계정이면 로그인 성공
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (!signInError) return router.push("/onboarding");
    // 로그인 실패 → 신규 가입 시도
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    if (!signUpError) return router.push("/onboarding");
    // 이미 있는 이메일인데 가입도 실패 = 비밀번호가 틀린 것 (오해 소지 메시지 대체)
    if (/already registered|already exists|user already/i.test(signUpError.message))
      return setError("비밀번호가 올바르지 않아요 · パスワードが正しくありません");
    setError(signUpError.message);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-center text-2xl font-bold text-tomo-navy">TOMO</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input className="rounded-full border px-4 py-3" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="rounded-full border px-4 py-3" type="password" placeholder="비밀번호 / パスワード" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <button className="rounded-full bg-tomo-blue py-3 font-bold text-white">시작하기 · はじめる</button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
    </main>
  );
}
