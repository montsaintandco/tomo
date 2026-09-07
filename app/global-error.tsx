"use client";

// 루트 레이아웃까지 실패했을 때 — 폰트·스타일 없이도 읽히게 인라인
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#fff", color: "#111827", margin: 0 }}>
        <main style={{ minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>TOMO</p>
          <p style={{ fontSize: 14 }}>잠시 문제가 생겼어요 · 一時的な問題が発生しました</p>
          <button type="button" onClick={reset} style={{ background: "#111827", color: "#fff", border: 0, borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600 }}>다시 시도 · 再試行</button>
        </main>
      </body>
    </html>
  );
}
