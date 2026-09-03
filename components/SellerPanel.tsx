"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { formatPrice, type Currency } from "@/lib/currency";
import { t, type Lang } from "@/lib/i18n";
import ListingOwnerActions from "@/components/ListingOwnerActions";

export type ReceivedOffer = {
  id: string; price: number; status: "pending" | "accepted" | "declined"; created_at: string;
  profiles: { nickname: string } | null;
};

// 판매자 도구 (본인 상품에서만): 끌어올리기(당근) + 받은 가격제안 수락/거절(메루카리)
export default function SellerPanel({ listingId, currency, bumpedAt, active, offers, lang, status, hidden, hiddenByAdmin }: {
  listingId: string; currency: Currency; bumpedAt: string; active: boolean; offers: ReceivedOffer[]; lang: Lang;
  status: string; hidden: boolean; hiddenByAdmin: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  const hoursLeft = Math.max(0, Math.ceil(48 - (Date.now() - new Date(bumpedAt).getTime()) / 3600000));
  const canBump = active && hoursLeft === 0;

  async function bump() {
    setBusy("bump"); setMsg("");
    const { error } = await createBrowserSupabase().rpc("bump_listing", { lid: listingId });
    setMsg(error ? t(lang, "bump.fail") : t(lang, "bump.done"));
    setBusy(null);
    if (!error) router.refresh();
  }

  async function respond(oid: string, accept: boolean) {
    setBusy(oid); setMsg("");
    const { error } = await createBrowserSupabase().rpc("respond_offer", { oid, accept });
    if (error) setMsg(t(lang, "offer.fail"));
    setBusy(null);
    router.refresh();
  }

  const pending = offers.filter((o) => o.status === "pending");

  return (
    <section className="card p-3.5 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-extrabold text-ink">{t(lang, "seller.tools")}</h2>
        <button type="button" onClick={bump} disabled={!canBump || busy === "bump"}
          className="btn bg-tomo-navy px-4 py-2 text-[13px] text-white">
          {t(lang, "bump.button")}
        </button>
      </div>
      {!canBump && active && <p className="mt-1 text-right text-[12px] text-ink-soft">{t(lang, "bump.wait", { h: hoursLeft })}</p>}
      <ListingOwnerActions listingId={listingId} status={status} hidden={hidden} hiddenByAdmin={hiddenByAdmin} lang={lang} />

      <h3 className="mt-4 text-[13px] font-bold text-ink">{t(lang, "offers.received")}</h3>
      {offers.length === 0 ? (
        <p className="mt-1 text-[12px] text-ink-soft">{t(lang, "offers.none")}</p>
      ) : (
        <ul className="mt-1 divide-y divide-tomo-navy/5">
          {offers.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="tnum block text-[15px] font-extrabold text-ink">{formatPrice(o.price, currency)}</span>
                <span className="block truncate text-[12px] text-ink-soft">
                  {o.profiles?.nickname ?? "—"} · {t(lang, `offers.status.${o.status}`)}
                </span>
              </span>
              {o.status === "pending" && (
                <span className="flex shrink-0 gap-1.5">
                  <button type="button" disabled={busy === o.id} onClick={() => respond(o.id, false)}
                    className="btn border-[1.5px] border-tomo-navy bg-white px-3 py-1.5 text-[12px] text-tomo-navy">
                    {t(lang, "offers.decline")}
                  </button>
                  <button type="button" disabled={busy === o.id} onClick={() => respond(o.id, true)}
                    className="btn bg-tomo-coral-deep px-3 py-1.5 text-[12px] text-white">
                    {t(lang, "offers.accept")}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && <p className="mt-1 text-[11px] text-ink-faint">{t(lang, "offers.acceptHint")}</p>}
      {msg && <p role="status" className="mt-2 text-[12px] text-ink-soft">{msg}</p>}
    </section>
  );
}
