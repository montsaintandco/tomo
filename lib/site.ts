// 사이트 절대 URL — canonical·OG·sitemap·토스 리다이렉트의 기준. 커스텀 도메인 연결 시 NEXT_PUBLIC_SITE_URL만 바꾼다.
// 팀 스코프 URL(-projects.vercel.app)은 Vercel이 X-Robots-Tag: noindex를 붙이므로 기본값은 색인 가능한 tomo-delta 도메인
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://tomo-delta.vercel.app").replace(/\/$/, "");
