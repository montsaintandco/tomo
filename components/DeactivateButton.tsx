"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type I18nKey, type Lang } from "@/lib/i18n";

const BLOCK_CODES = ["tx", "proxy", "refund", "balance", "payout"] as const;

// 탈퇴 = /api/account/delete: 익명화·상품 숨김 후 service_role 키가 있으면 auth 계정 완전 삭제
export default function DeactivateButton({ lang }: { lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blockers, setBlockers] = useState<{ code: string; n: number }[]>([]);
  const router = useRouter();

  async function go() {
    if (!confirm(t(lang, "my.deleteConfirm"))) return;
    setBusy(true); setError(""); setBlockers([]);
    const res = await fetch("/api/account/delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: t(lang, "my.deactivated") }),
    });
    // 진행 중인 일이 있으면 탈퇴 차단(0028) — 사유 목록을 보여 준다
    if (res.status === 409) {
      const json = await res.json().catch(() => ({}));
      setBlockers(Array.isArray(json.blockers) ? json.blockers : []);
      setError(t(lang, "my.blocked")); setBusy(false); return;
    }
    if (!res.ok && res.status !== 202) { setError(t(lang, "my.deactivateFail")); setBusy(false); return; }
    if (res.status === 202) alert(t(lang, "my.deletedPartial"));
    await createBrowserSupabase().auth.signOut();
    router.push("/"); router.refresh();
  }

  return (
    <div className="text-center">
      <button type="button" onClick={go} disabled={busy} className="press py-2 text-[12px] text-ink-faint underline underline-offset-2 hover:text-tomo-rose">
        {t(lang, "my.deactivate")}
      </button>
      {error && <p role="alert" className="text-[12px] text-tomo-rose">{error}</p>}
      {blockers.length > 0 && (
        <ul className="mt-1 text-[12px] text-ink-soft">
          {blockers.filter((b) => (BLOCK_CODES as readonly string[]).includes(b.code)).map((b) => (
            <li key={b.code}>{t(lang, `my.block.${b.code}` as I18nKey, { n: b.n })}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
