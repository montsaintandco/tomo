"use client";
import { useEffect, useSyncExternalStore } from "react";

// 루트 레이아웃까지 실패했을 때 — 폰트·스타일·i18n 없이도 읽히게 인라인. 언어는 tomo_lang 쿠키 → 브라우저 언어 → ko (서버 렌더는 ko)
const readLang = () => {
  const m = /(?:^|;\s*)tomo_lang=(ko|ja)/.exec(document.cookie);
  return m ? m[1] : /^ja\b/i.test(navigator.language) ? "ja" : "ko";
};
const noop = () => () => {};

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ja = useSyncExternalStore(noop, readLang, () => "ko") === "ja";
  useEffect(() => {
    if (!error.digest) fetch("/api/client-error", { method: "POST", keepalive: true, headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: error.message, stack: error.stack, path: location.pathname }) }).catch(() => {});
  }, [error]);
  return (
    <html lang={ja ? "ja" : "ko"}>
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#fff", color: "#111827", margin: 0 }}>
        <main style={{ minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>TOMO</p>
          <p style={{ fontSize: 14 }}>{ja ? "一時的な問題が発生しました" : "잠시 문제가 생겼어요"}</p>
          {error.digest && <p style={{ fontSize: 11, color: "#9ca3af" }}>ref {error.digest}</p>}
          <button type="button" onClick={reset} style={{ background: "#111827", color: "#fff", border: 0, borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600 }}>{ja ? "再試行" : "다시 시도"}</button>
        </main>
      </body>
    </html>
  );
}