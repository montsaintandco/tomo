// 결과 바 빠른 칩(가격대 3단·새 상품/중고) — 필터 패널과 같은 URL 파라미터(min·max·cond)를 켜고 끈다.
// 가격은 뷰어 통화 기준(필터 패널과 같다). 순수 함수: href 계산만.
import type { Currency } from "@/lib/currency";

export const PRICE_BANDS: Record<Currency, readonly [number | undefined, number | undefined][]> = {
  KRW: [[undefined, 10000], [10000, 50000], [50000, undefined]],
  JPY: [[undefined, 1000], [1000, 5000], [5000, undefined]],
};

export type QuickChip =
  | { kind: "price"; min?: number; max?: number; active: boolean; href: string }
  | { kind: "cond"; cond: "new" | "used"; active: boolean; href: string };

const num = (v: string | null) => (v ? Number(v) : undefined);

export function quickChips(params: URLSearchParams, currency: Currency): QuickChip[] {
  const href = (edit: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(params);
    edit(p);
    return `/global?${p.toString()}`;
  };
  const min = num(params.get("min")), max = num(params.get("max")), cond = params.get("cond");
  const price: QuickChip[] = PRICE_BANDS[currency].map(([lo, hi]) => {
    const active = min === lo && max === hi;
    return {
      kind: "price", min: lo, max: hi, active,
      href: href((p) => {
        p.delete("min"); p.delete("max");
        if (active) return; // 다시 누르면 끈다
        if (lo) p.set("min", String(lo));
        if (hi) p.set("max", String(hi));
      }),
    };
  });
  const conds: QuickChip[] = (["new", "used"] as const).map((c) => ({
    kind: "cond", cond: c, active: cond === c,
    href: href((p) => (cond === c ? p.delete("cond") : p.set("cond", c))),
  }));
  return [...price, ...conds];
}
