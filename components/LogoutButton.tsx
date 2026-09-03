"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

export default function LogoutButton({ lang = "ko" }: { lang?: Lang }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  async function logout() {
    await createBrowserSupabase().auth.signOut();
    start(() => { router.push("/"); router.refresh(); });
  }
  return (
    <button onClick={logout} disabled={pending}
      className="btn border-[1.5px] border-tomo-navy/15 bg-white px-3 py-2 text-xs text-ink-soft">
      {t(lang, "my.logout")}
    </button>
  );
}
