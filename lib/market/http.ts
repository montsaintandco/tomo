// 외부 마켓 공용 fetch — 타임아웃 + 재시도 + 백오프 (tokyobuy lib/http.ts 이식)

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 ||
         status === 500 || status === 502 || status === 503 || status === 504;
}

export function backoffMs(attempt: number, base = 300, cap = 4000): number {
  const a = Math.max(1, Math.floor(attempt));
  return Math.min(cap, base * 2 ** (a - 1));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchRetryOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryBackoffBase?: number;
}

export async function fetchWithRetry(url: string, opts: FetchRetryOptions = {}): Promise<Response> {
  const { timeoutMs = 8000, retries = 2, retryBackoffBase = 300, ...init } = opts;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const last = attempt === retries + 1;
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (isRetryableStatus(res.status) && !last) {
        await sleep(backoffMs(attempt, retryBackoffBase));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (last) throw e;
      await sleep(backoffMs(attempt, retryBackoffBase));
    }
  }
  throw lastErr ?? new Error("fetchWithRetry: unknown failure");
}
