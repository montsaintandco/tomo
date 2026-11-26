// 사이트 절대 URL — canonical·OG·sitemap·결제 리다이렉트의 기준. 운영 주소가 바뀌면 NEXT_PUBLIC_SITE_URL만 바꾼다.
// 기본값은 운영 주소(Coolify, 2026-11 이전). 옛 Vercel 주소는 되돌리기용이라 기본값에 두지 않는다.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://tomo.airship.click").replace(/\/$/, "");