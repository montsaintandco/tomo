// 인메모리 슬라이딩 윈도우 레이트리밋 — 봇 1대가 외부 마켓 스크래핑·번역을 무한 호출해 IP 차단·함수 비용 폭증을 일으키는 것을 막는다.
// ponytail: 서버리스 인스턴스별 카운터라 완전하진 않지만 단일 인스턴스 폭주는 막는다. 정확한 한도가 필요하면 Vercel Firewall 룰 또는 Upstash로.
const hits = new Map<string, number[]>();
let sweep = 0;

export function allow(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  if (++sweep % 500 === 0) for (const [k, arr] of hits) if (arr.every((t) => now - t >= windowMs)) hits.delete(k); // 메모리 청소
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length <= limit;
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
