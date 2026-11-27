"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

// 보류 상품 해제(0041 admin_release_listing_hold) — 반송·회수 확인 메모를 받아 판매중+판매자 숨김으로 돌린다.
// 판매자가 「다시 보이기」를 눌러야 다시 팔린다.
export default function ReleaseHoldButton({ listingId, title }: { listingId: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isPending, start] = useTransition();
  const router = useRouter();

  async function run() {
    const note = window.prompt(`「${title}」 보류를 풀까요?\n반송(판매자 회수) 확인 내용을 적어 주세요. 풀면 판매중+숨김이 되고, 판매자가 「다시 보이기」를 눌러 다시 판매해요.`, "");
    if (note == null) return;
    if (!note.trim()) { setError("확인 메모를 적어 주세요"); return; }
    setBusy(true); setError("");
    const { error: e } = await createBrowserSupabase().rpc("admin_release_listing_hold", { p_id: listingId, p_note: note.trim() });
    setBusy(false);
    if (e) { setError(e.message); return; }
    start(() => router.refresh());
  }

  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={run} disabled={busy || isPending}
        className="press rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[12px] font-bold text-tomo-navy disabled:opacity-45">
        보류 해제
      </button>
      {error && <span role="alert" className="mt-1 text-[11px] text-tomo-rose">{error}</span>}
    </span>
  );
}
