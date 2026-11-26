import { beforeEach, describe, expect, it } from "vitest";
import { addRecentViewed, getRecentViewed, clearRecentViewed } from "../../lib/home/recent-viewed";

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> }).localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => void store.set(k, v),
  removeItem: (k) => void store.delete(k),
};
const it1 = (href: string) => ({ href, title: "t", thumb: "https://x/1.jpg", price: 100, currency: "JPY" as const });

describe("recent viewed", () => {
  beforeEach(() => store.clear());

  it("최신이 앞, 같은 주소는 하나, 12개까지", () => {
    for (let i = 0; i < 14; i++) addRecentViewed(it1(`/global/mercari/m${i}`));
    addRecentViewed(it1("/global/mercari/m5"));
    const list = getRecentViewed();
    expect(list.length).toBe(12);
    expect(list[0].href).toBe("/global/mercari/m5");
    expect(list.filter((r) => r.href === "/global/mercari/m5").length).toBe(1);
  });

  it("외부 주소·깨진 값은 버린다", () => {
    addRecentViewed({ ...it1("https://evil.example/x") });
    store.set("tomo-recent-viewed", JSON.stringify([it1("/listings/1"), { href: 1 }, "x"]));
    expect(getRecentViewed().map((r) => r.href)).toEqual(["/listings/1"]);
    clearRecentViewed();
    expect(getRecentViewed()).toEqual([]);
  });
});
