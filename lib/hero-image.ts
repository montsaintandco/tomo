import fs from "node:fs";
import path from "node:path";

// 히어로 타일 대표 사진 — public/hero/<key>.jpg 가 있으면 라이브 썸네일 대신 쓴다 (서버 전용, 요청마다 존재 확인은 stat 1회)
export function heroImage(key: string): string | null {
  return fs.existsSync(path.join(process.cwd(), "public", "hero", `${key}.jpg`)) ? `/hero/${key}.jpg` : null;
}
