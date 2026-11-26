import { describe, expect, it } from "vitest";
import { progressCounts } from "../../components/mypage/counts";
import { mergePhotos } from "../../lib/image-resize";

describe("progressCounts — 마이페이지 진행 보드", () => {
  it("직거래 상태를 4단계로 묶고 결제 전·완료·취소는 뺀다", () => {
    const tx = ["pending_payment", "paid", "shipped", "shipped_to_center", "center_received", "shipped_international", "delivered", "completed", "cancelled"]
      .map((status) => ({ status }));
    expect(progressCounts(tx, [])).toEqual({ paid: 1, sent: 3, intl: 1, arrived: 1 });
  });

  it("구매대행은 같은 주문을 한 건으로, 가장 앞 단계로 센다", () => {
    const proxy = [
      { status: "shipped_international", order_id: "o1" },
      { status: "purchasing", order_id: "o1" },
      { status: "center_received", order_id: "o2" },
      { status: "delivered", order_id: null },
      { status: "quoted", order_id: null },
    ];
    expect(progressCounts([], proxy)).toEqual({ paid: 1, sent: 1, intl: 0, arrived: 1 });
  });
});

describe("mergePhotos — 판매 폼 사진", () => {
  const f = (name: string, type = "image/jpeg") => ({ name, size: name.length, type, lastModified: 1 });

  it("이미지만 받고 같은 파일은 한 번만", () => {
    const { files, dropped } = mergePhotos([f("a")], [f("a"), f("b"), f("doc", "application/pdf")]);
    expect(files.map((x) => x.name)).toEqual(["a", "b"]);
    expect(dropped).toBe(0);
  });

  it("최대 장수를 넘기면 자르고 버린 수를 알려 준다", () => {
    const { files, dropped } = mergePhotos([f("1"), f("22"), f("333")], [f("4444"), f("55555"), f("666666")], 5);
    expect(files).toHaveLength(5);
    expect(dropped).toBe(1);
  });
});
