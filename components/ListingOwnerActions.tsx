"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

// 내 상품 컨트롤 (당근·메루카리의 판매자 메뉴): 상태 전환 · 숨기기 · 수정 · 삭제. RLS(update/delete own)가 소유권을 지킨다
export default function ListingOwnerActions({ listingId, status, hidden, hiddenByAdmin, lang, compact = false }: {
  listingId: string; status: string; hidden: boolean; hiddenByAdmin: boolean; lang: Lang; compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  const working = busy || isPending;

  async function update(patch: Record<string, unknown>) {
    setBusy(true); setError("");
    const { error: e } = await createBrowserSupabase().from("listings").update(patch).eq("id", listingId);
    setBusy(false);
    if (e) { setError(t(lang, "own.fail")); return; }
    startTransition(() => router.refresh());
  }

  async function remove() {
    if (!confirm(t(lang, "own.deleteConfirm"))) return;
    setBusy(true); setError("");
    const { error: e } = await createBrowserSupabase().from("listings").delete().eq("id", listingId);
    setBusy(false);
    if (e) { setError(t(lang, "own.fail")); return; }
    router.push("/mypage"); router.refresh();
  }

  const chip = "press rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[12px] font-bold text-tomo-navy disabled:opacity-45";
  const statusButtons = (["active", "reserved", "sold"] as const).filter((s) => s !== status);

  return (
    <div className={compact ? "" : "mt-3"}>
      {hiddenByAdmin && <p className="mb-2 text-[12px] font-bold text-tomo-rose">{t(lang, "own.hiddenByAdmin")}</p>}
      <div className="flex flex-wrap gap-1.5">
        {statusButtons.map((s) => (
          <button key={s} type="button" disabled={working} onClick={() => update({ status: s, reserved_at: s === "reserved" ? new Date().toISOString() : null })} className={chip}>
            {t(lang, s === "active" ? "own.setActive" : s === "reserved" ? "own.setReserved" : "own.setSold")}
          </button>
        ))}
        {!hiddenByAdmin && (
          <button type="button" disabled={working} onClick={() => update({ hidden: !hidden })} className={chip}>
            {hidden ? t(lang, "own.unhide") : t(lang, "own.hide")}
          </button>
        )}
        <Link href={`/listings/${listingId}/edit`} className={chip}>{t(lang, "own.edit")}</Link>
        <button type="button" disabled={working} onClick={remove}
          className="press rounded-full bg-tomo-coral-deep/10 px-3 py-1.5 text-[12px] font-bold text-tomo-coral-deep disabled:opacity-45">
          {t(lang, "own.delete")}
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-[12px] text-tomo-rose">{error}</p>}
    </div>
  );
}
