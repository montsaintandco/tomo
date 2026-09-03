"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { PROXY_FEE_JPY, PROXY_REMIT_FEE_JPY, PROXY_SHIPPING_ESTIMATE_JPY } from "@/lib/fees";

export default function QuoteForm({ id, defaultItemPrice, quoted, total }: {
  id: string; defaultItemPrice: number; quoted: boolean; total: number | null;
}) {
  const [itemPrice, setItemPrice] = useState(String(defaultItemPrice));
  const [fee, setFee] = useState(String(PROXY_FEE_JPY + PROXY_REMIT_FEE_JPY));
  const [shipping, setShipping] = useState(String(PROXY_SHIPPING_ESTIMATE_JPY));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const sum = (Number(itemPrice) || 0) + (Number(fee) || 0) + (Number(shipping) || 0);

  async function send() {
    setBusy(true); setError("");
    const supabase = createBrowserSupabase();
    const { error } = await supabase.rpc("quote_proxy", {
      p_id: id,
      p_item_price: Math.max(0, Math.round(Number(itemPrice) || 0)),
      p_fee: Math.max(0, Math.round(Number(fee) || 0)),
      p_shipping: Math.max(0, Math.round(Number(shipping) || 0)),
    });
    if (error) { setError(error.message); setBusy(false); return; }
    router.refresh();
  }

  return (
    <div className="rounded-card bg-tomo-navy/5 p-2">
      {quoted && total != null && (
        <p className="mb-2 text-xs text-ink-soft">발송된 견적: ¥{total.toLocaleString()} · 수정 후 재발송 가능</p>
      )}
      <div className="mb-2 grid grid-cols-3 gap-2">
        <Field label="상품가" value={itemPrice} onChange={setItemPrice} />
        <Field label="수수료" value={fee} onChange={setFee} />
        <Field label="배송비" value={shipping} onChange={setShipping} />
      </div>
      <div className="mb-2 text-right text-xs font-bold text-tomo-navy">합계 ¥{sum.toLocaleString()}</div>
      <button onClick={send} disabled={busy}
        className="btn w-full bg-tomo-navy py-2 text-sm text-white">
        {busy ? "발송 중…" : quoted ? "견적 재발송" : "견적 발송"}
      </button>
      {error && <p className="mt-1 text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] text-ink-soft">{label} (¥)</span>
      <input type="number" min={0} value={value} onChange={(e) => onChange(e.target.value)}
        className="tnum w-full rounded-full bg-white px-2.5 py-1 text-sm shadow-soft" />
    </label>
  );
}
