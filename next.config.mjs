// 보안 헤더 — 클릭재킹·다운그레이드·리퍼러 유출 차단. 폰트는 next/font 셀프호스팅이라 외부 CSS 의존 없음.
// CSP는 토스 결제창이 카드사 도메인을 다수 iframe/redirect로 열어 frame-src 열거가 깨지기 쉬우니 Report-Only로 먼저 관찰한다.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://*.tosspayments.com\")" },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.tosspayments.com https://*.tosspayments.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.tosspayments.com",
      "frame-src https://*.tosspayments.com https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://*.tosspayments.com",
    ].join("; "),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
