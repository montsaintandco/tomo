import { ImageResponse } from "next/og";

// 기본 OG 이미지 — 링크 공유 카드. 워드마크 + 한/일 한 줄. 상품 상세는 상품 사진을 쓰므로 여기선 브랜드만
export const runtime = "edge";
export const alt = "TOMO — 한국·일본 중고거래";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "96px", background: "#ffffff", color: "#111827", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 16, background: "#1D4ED8", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 44, fontWeight: 800 }}>T</div>
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -3 }}>TOMO</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 52, fontWeight: 700, lineHeight: 1.2 }}>일본 물건을 내 나라에서 사고 팔기</div>
        <div style={{ marginTop: 16, fontSize: 30, color: "#6B7280" }}>韓国のもの、日本のもの。ひとつのマーケット。</div>
        <div style={{ marginTop: 56, display: "flex", gap: 14, fontSize: 24, color: "#374151" }}>
          {["에스크로 안전결제", "센터 검수", "자동번역 채팅"].map((s) => (
            <div key={s} style={{ padding: "10px 18px", background: "#F3F4F6", borderRadius: 8 }}>{s}</div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
