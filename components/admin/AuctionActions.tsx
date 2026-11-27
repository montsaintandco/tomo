"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { adminAuctionError } from "@/lib/auction-admin";

// 경매 운영 조작(0048) — 강제 종료·입찰 무효·경고 해제. 메모 필수, 운영자 세션 RPC(활동 기록은 DB 가 남긴다). 돈은 움직이지 않는다
type Props =
  | { kind: "close"; auctionId: string; code: string; bidders: number }
  | { kind: "void"; auctionId: string; bidderId: string; nickname: string; leading: boolean }
  | { kind: "strike"; strikeId: string; nickname: string };

export default function AuctionActions(p: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const label = p.kind === "close" ? "강제 종료" : p.kind === "void" ? "입찰 무효" : "경고 해제";
  const confirmText = p.kind === "close"
    ? `${p.code} 경매를 지금 끝낼까요? 입찰자 ${p.bidders}명과 판매자에게 알림이 가고, 상품은 숨김이 돼요. 되돌릴 수 없어요.`
    : p.kind === "void"
      ? `${p.nickname} 님의 이 경매 입찰을 전부 무효로 할까요?${p.leading ? " 지금 1등이라 차순위가 1등이 되고 현재가가 다시 계산돼요." : ""} 이 사람은 이 경매에 다시 입찰할 수 없어요.`
      : `${p.nickname} 님의 미결제 경고를 해제할까요? 남은 경고로 입찰 제한을 다시 정해요.`;

  async function run() {
    const n = note.trim();
    if (!n) { setError("메모를 적어 주세요"); return; }
    if (!window.confirm(confirmText)) return;
    setBusy(true); setError("");
    const sb = createBrowserSupabase();
    const { error: e } = p.kind === "close"
      ? await sb.rpc("admin_close_auction", { p_auction: p.auctionId, p_note: n })
      : p.kind === "void"
        ? await sb.rpc("admin_void_bid", { p_auction: p.auctionId, p_bidder: p.bidderId, p_note: n })
        : await sb.rpc("admin_clear_strike", { p_strike: p.strikeId, p_note: n });
    setBusy(false);
    if (e) { setError(adminAuctionError(e.message)); return; }
    setOpen(false); setNote("");
    startTransition(() => router.refresh());
  }

  const off = busy || isPending;
  const danger = p.kind !== "strike";
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)}
      className={`press rounded-full px-3 py-1.5 text-[12px] font-bold ${danger ? "bg-tomo-coral-deep/10 text-tomo-coral-deep" : "bg-tomo-navy/5 text-tomo-navy"}`}>
      {label}
    </button>
  );
  return (
    <div className="flex w-full flex-col items-end gap-1.5">
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} autoFocus
        placeholder={`${label} 사유(필수, 활동 기록에 남아요)`} aria-label={`${label} 사유`}
        className="w-full rounded-md border border-[var(--a-border)] bg-white px-2 py-1 text-[12px]" />
      <div className="flex gap-1.5">
        <button type="button" disabled={off} onClick={() => { setOpen(false); setError(""); }} className="press rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[12px] font-bold text-ink-soft">취소</button>
        <button type="button" disabled={off} onClick={run}
          className={`press rounded-full px-3 py-1.5 text-[12px] font-bold disabled:opacity-45 ${danger ? "bg-tomo-coral-deep text-white" : "bg-tomo-navy text-white"}`}>
          {label} 실행
        </button>
      </div>
      {error && <p role="alert" className="text-[11px] text-tomo-rose">{error}</p>}
    </div>
  );
}
