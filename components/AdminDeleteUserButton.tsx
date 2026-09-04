"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// 운영자 완전 삭제 — service_role 키가 서버에 없으면 503로 안내 (한국어 고정 운영 화면)
export default function AdminDeleteUserButton({ userId, nickname }: { userId: string; nickname: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isPending, start] = useTransition();
  const router = useRouter();

  async function run() {
    if (!confirm(`${nickname} 님의 계정을 완전히 삭제할까요? 프로필은 익명으로 남고 로그인은 영구히 불가능해요.`)) return;
    setBusy(true); setError("");
    const res = await fetch("/api/admin/users/delete", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(res.status === 503 ? "서버에 SUPABASE_SERVICE_ROLE_KEY가 없어요" : (j.error ?? "실패")); return; }
    start(() => router.refresh());
  }

  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={run} disabled={busy || isPending}
        className="press rounded-full bg-tomo-coral-deep px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-45">
        완전 삭제
      </button>
      {error && <span role="alert" className="mt-1 max-w-[12rem] text-[11px] text-tomo-rose">{error}</span>}
    </span>
  );
}
