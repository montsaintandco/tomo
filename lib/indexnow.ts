import { SITE_URL } from "./site";

// IndexNow — 상품 등록·변경 시 네이버·빙(·Yandex)에 즉시 알림. 키 파일은 public/<KEY>.txt (내용 = 키)
export const INDEXNOW_KEY = "7c1f0b2e9a4d4e6f8b3a2c5d7e9f1a3b";

export async function pingIndexNow(paths: string[]): Promise<void> {
  if (!SITE_URL.startsWith("https://") || paths.length === 0) return;
  try {
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(SITE_URL).host, key: INDEXNOW_KEY, keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: paths.slice(0, 10000).map((p) => `${SITE_URL}${p}`),
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // 색인 알림 실패는 사용자 흐름과 무관 — 조용히 무시
  }
}
