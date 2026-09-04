"use client";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

function urlBase64ToUint8Array(s: string) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// 웹푸시 켜기/끄기 — 서비스워커 등록 → 권한 → 구독 → push_subscriptions 저장 (RLS: 본인 행만)
export default function PushToggle({ lang }: { lang: Lang }) {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "denied" | "busy" | "nokey">("busy");
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let alive = true;
    // 렌더 직후 동기 setState를 피하려고 한 틱 뒤에 판정한다 (react-hooks/set-state-in-effect)
    (async () => {
      await Promise.resolve();
      if (!alive) return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setState("unsupported"); return; }
      if (!vapid) { setState("nokey"); return; }
      if (Notification.permission === "denied") { setState("denied"); return; }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        if (alive) setState(sub ? "on" : "off");
      } catch { if (alive) setState("off"); }
    })();
    return () => { alive = false; };
  }, [vapid]);

  async function enable() {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState("denied"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid!) });
      const j = sub.toJSON();
      const supabase = createBrowserSupabase();
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("push_subscriptions").upsert({
        user_id: auth.user!.id, endpoint: sub.endpoint,
        p256dh: j.keys!.p256dh, auth: j.keys!.auth, user_agent: navigator.userAgent.slice(0, 200),
      }, { onConflict: "endpoint" });
      if (error) throw error;
      setState("on");
    } catch { setState("off"); }
  }

  async function disable() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await createBrowserSupabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
    } finally { setState("off"); }
  }

  const note = state === "unsupported" ? t(lang, "notif.unsupported")
    : state === "denied" ? t(lang, "notif.denied")
    : state === "nokey" ? t(lang, "notif.notReady") : null;

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-bold text-ink">{t(lang, "notif.title")}</p>
        <p className="text-[12px] text-ink-soft">{note ?? t(lang, "notif.desc")}</p>
      </div>
      {(state === "on" || state === "off" || state === "busy") && (
        <button type="button" role="switch" aria-checked={state === "on"} disabled={state === "busy"}
          onClick={state === "on" ? disable : enable}
          className={`press relative h-7 w-12 shrink-0 rounded-full transition-colors ${state === "on" ? "bg-tomo-navy" : "bg-tomo-navy/15"}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft transition-transform ${state === "on" ? "translate-x-6" : "translate-x-1"}`} />
          <span className="sr-only">{state === "on" ? t(lang, "notif.on") : t(lang, "notif.off")}</span>
        </button>
      )}
    </div>
  );
}
