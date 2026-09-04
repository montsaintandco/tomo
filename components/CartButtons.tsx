"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

type Item = { source: string; sourceId: string; title: string; price: number; currency: "KRW" | "JPY"; url: string; images: string[]; sellerName: string };

// SAZO식 2버튼: 장바구니(아웃라인) + 바로 구매(코랄). 둘 다 /api/cart로 담고, 바로 구매는 주문서로 이동
export default function CartButtons({ lang = "ko", ...item }: Item & { lang?: Lang }) {
  const [state, setState] = useState<"idle" | "adding" | "added">("idle");
  const [error, setError] = useState("");
  const router = useRouter();

  async function add(): Promise<string | null> {
    setError("");
    const res = await fetch("/api/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error || t(lang, "cart.addFail")); return null; }
    window.dispatchEvent(new CustomEvent("tomo:cart", { detail: json.count })); // GNB 배지 즉시 갱신
    return json.itemId as string;
  }

  async function onAdd() { setState("adding"); const id = await add(); setState(id ? "added" : "idle"); }
  async function onBuy() { setState("adding"); const id = await add(); if (id) router.push(`/order?items=${id}`); else setState("idle"); }

  return (
    <div className="flex-1">
      <div className="flex gap-2">
        {state === "added" ? (
          <Link href="/cart" className="press flex flex-1 items-center justify-center rounded-full border-[1.5px] border-tomo-navy/15 bg-white py-3 text-sm font-bold text-tomo-navy">
            {t(lang, "cart.added")}
          </Link>
        ) : (
          <button type="button" onClick={onAdd} disabled={state === "adding"}
            className="btn flex flex-1 items-center justify-center gap-1.5 border-[1.5px] border-tomo-navy/15 bg-white py-3 text-sm text-ink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <path d="M3.5 4.5h2l2.2 10.5h10.6l1.9-7.5H7" /><circle cx="9.5" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" />
            </svg>
            {state === "adding" ? t(lang, "cart.adding") : t(lang, "cart.add")}
          </button>
        )}
        <button type="button" onClick={onBuy} disabled={state === "adding"} className="btn flex-[1.4] bg-tomo-coral-deep py-3 text-sm text-white">
          {t(lang, "cart.buyNow")}
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}
