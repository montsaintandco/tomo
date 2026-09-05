"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { formatPrice, type Currency } from "@/lib/currency";
import { t, type Lang } from "@/lib/i18n";

export type MyOffer = { id: string; price: number; status: "pending" | "accepted" | "declined" } | null;

// 메루카리 희망가격: 금액 직접 입력 없이 3단계 할인만 (¥10,000 / 100,000원 기준으로 폭이 달라짐)
function tiers(price: number, currency: Currency): { pct: number; amount: number }[] {
  const big = currency === "JPY" ? price >= 10000 : price >= 100000;
  const step = currency === "JPY" ? 10 : 100;
  return (big ? [5, 10, 15] : [5, 8, 10]).map((pct) => ({
    pct, amount: Math.floor((price * (100 - pct)) / 100 / step) * step,
  }));
}

export default function OfferButton({ listingId, price, currency, initial, guest, lang }: {
  listingId: string; price: number; currency: Currency; initial: MyOffer; guest: boolean; lang: Lang;
}) {
  const [offer, setOffer] = useState<MyOffer>(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function send(amount: number) {
    if (guest) { router.push(`/login?next=/listings/${listingId}`); return; }
    setBusy(true); setError("");
    try {
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push(`/login?next=/listings/${listingId}`); return; }
      // 거절된 제안이 있으면 지우고 새로 (listing+buyer 유니크)
      if (offer && offer.status !== "accepted") await supabase.from("offers").delete().eq("id", offer.id);
      const { data, error: e } = await supabase.from("offers")
        .insert({ listing_id: listingId, buyer_id: user.id, price: amount })
        .select("id, price, status").single();
      if (e) throw e;
      setOffer(data as MyOffer); setOpen(false);
    } catch {
      setError(t(lang, "offer.fail"));
    } finally { setBusy(false); }
  }

  async function withdraw() {
    if (!offer) return;
    setBusy(true);
    const supabase = createBrowserSupabase();
    const { error: e } = await supabase.from("offers").delete().eq("id", offer.id);
    if (!e) setOffer(null);
    setBusy(false);
  }

  if (offer?.status === "accepted") {
    return <p className="text-[13px] font-bold text-tomo-navy">{t(lang, "offer.accepted")}</p>;
  }

  return (
    <div>
      {offer?.status === "pending" ? (
        <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink">
          <span className="tnum font-bold">{t(lang, "offer.pending", { price: formatPrice(offer.price, currency) })}</span>
          <button type="button" onClick={withdraw} disabled={busy} className="press text-[12px] text-ink-soft underline underline-offset-2">
            {t(lang, "offer.withdraw")}
          </button>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {offer?.status === "declined" && <span className="text-[13px] text-ink-soft">{t(lang, "offer.declined")}</span>}
          <button type="button" onClick={() => (guest ? send(0) : setOpen(!open))} aria-expanded={open}
            className="press inline-flex items-center gap-1.5 rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[13px] font-bold text-tomo-navy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <path d="M3.5 12.5 12 4h7.5V11.5L11 20z" /><circle cx="15.5" cy="8.5" r="1.2" />
            </svg>
            {offer?.status === "declined" ? t(lang, "offer.retry") : t(lang, "offer.button")}
          </button>
        </div>
      )}

      {open && !offer && (
        <div className="reveal mt-3 rounded-card bg-tomo-navy/5 p-3.5">
          <p className="text-[13px] font-bold text-ink">{t(lang, "offer.title")}</p>
          <p className="mt-0.5 text-[12px] text-ink-soft">{t(lang, "offer.sub")}</p>
          <div className="mt-3 flex gap-2">
            {tiers(price, currency).map((tier) => (
              <button key={tier.pct} type="button" disabled={busy} onClick={() => send(tier.amount)}
                className="btn flex flex-1 flex-col items-center bg-white py-2.5 text-ink shadow-soft">
                <span className="tnum text-[13px] font-extrabold">{formatPrice(tier.amount, currency)}</span>
                <span className="text-[11px] font-bold text-tomo-coral-deep">{t(lang, "offer.off", { p: tier.pct })}</span>
              </button>
            ))}
          </div>
          {busy && <p className="mt-2 text-[12px] text-ink-soft">{t(lang, "offer.sending")}</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-[12px] text-tomo-rose">{error}</p>}
    </div>
  );
}
