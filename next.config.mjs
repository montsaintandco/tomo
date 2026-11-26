// 보안 헤더 — 클릭재킹·다운그레이드·리퍼러 유출 차단. 폰트는 next/font 셀프호스팅이라 외부 CSS 의존 없음.
// CSP는 결제창(Stripe Checkout, 리다이렉트)·카드사 인증 도메인이 다양해 frame-src 열거가 깨지기 쉬우니 Report-Only로 먼저 관찰한다.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-src https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
      "report-uri /api/csp-report", // 없으면 Report-Only 위반이 어디에도 안 남는다
    ].join("; "),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Vercel 밖(도쿄 서버 Docker 이미지)에서는 node server.js 하나로 도는 standalone 출력
  output: process.env.VERCEL ? undefined : "standalone",
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
