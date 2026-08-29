"use client";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function LogoutButton() {
  async function logout() {
    await createBrowserSupabase().auth.signOut();
    window.location.href = "/";
  }
  return (
    <button onClick={logout}
      className="btn border-[1.5px] border-tomo-navy/15 bg-white px-3 py-1.5 text-xs text-ink-soft">
      로그아웃
    </button>
  );
}
