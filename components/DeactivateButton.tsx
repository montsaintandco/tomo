"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

// 탈퇴 = 비활성화 (프로필 익명화 + 상품 숨김 + 로그아웃). auth 계정 삭제는 service_role 키 투입 후
export default function DeactivateButton({ lang }: { lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function go() {
    if (!confirm(t(lang, "my.deactivateConfirm"))) return;
    setBusy(true); setError("");
    const supabase = createBrowserSupabase();
    const { error: e } = await supabase.rpc("deactivate_my_account", { p_label: t(lang, "my.deactivated") });
    if (e) { setError(t(lang, "my.deactivateFail")); setBusy(false); return; }
    await supabase.auth.signOut();
    router.push("/"); router.refresh();
  }

  return (
    <div className="text-center">
      <button type="button" onClick={go} disabled={busy} className="press py-2 text-[12px] text-ink-faint underline underline-offset-2 hover:text-tomo-rose">
        {t(lang, "my.deactivate")}
      </button>
      {error && <p role="alert" className="text-[12px] text-tomo-rose">{error}</p>}
    </div>
  );
}
