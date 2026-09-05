"use client";
import { useState } from "react";
import { formatPrice, type Currency } from "@/lib/currency";
import { t, type Lang } from "@/lib/i18n";
import type { MarketSource } from "@/lib/market/types";

type Stats = { count: number; median?: number; min?: number; max?: number; sources: MarketSource[] };

// 판매 마법사 — 제목으로 4마켓 시세를 조회해 중앙값을 제안 (메루카리 出品 마법사의 시세 제안 자리)
export default function PriceHint({ title, currency, lang, onApply }: {
  title: string; currency: Currency; lang: Lang; onApply: (price: number) => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    if (title.trim().length < 2 || busy) return;
    setBusy(true); setStats(null);
    try {
      const res = await fetch(`/api/market/price?q=${encodeURIComponent(title.trim())}&currency=${currency}`);
      setStats(res.ok ? await res.json() : { count: 0, sources: [] });
    } catch {
      setStats({ count: 0, sources: [] });
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-1.5">
      <button type="button" onClick={check} disabled={busy || title.trim().length < 2}
        className="press rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[12px] font-bold text-tomo-navy disabled:opacity-45">
        {busy ? t(lang, "sell.priceLoading") : t(lang, "sell.priceCheck")}
      </button>
      {stats && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">
          {stats.count > 0 && stats.median != null ? (
            <>
              <span className="tnum text-ink">
                {t(lang, "sell.priceResult", { n: stats.count, median: formatPrice(stats.median, currency), min: formatPrice(stats.min!, currency), max: formatPrice(stats.max!, currency) })}
              </span>
              {stats.sources.length > 0 && <span> · {t(lang, "sell.priceSrc", { sources: stats.sources.map((s) => t(lang, `source.${s}`)).join("·") })}</span>}
              <button type="button" onClick={() => onApply(stats.median!)}
                className="press ml-2 font-bold text-tomo-coral-deep underline underline-offset-2">
                {t(lang, "sell.priceApply")}
              </button>
            </>
          ) : t(lang, "sell.priceNone")}
        </p>
      )}
    </div>
  );
}
