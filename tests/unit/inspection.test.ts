import { describe, it, expect } from "vitest";
import { matchOps, opsCodeQ } from "../../lib/ops-api";
import { centerMatchTag, centerShipLines, newPhotoPath, photoPathOk } from "../../lib/inspection";
import { parseOrderCode } from "../../lib/order-code";

// T4 센터 검수(0054)·센터 발송 안내. DB 사진 경로 검사(^kind/id/[A-Za-z0-9._-]{1,80}$)와 화면·API 규칙이 같아야 한다.
const id = "11111111-2222-3333-4444-555555555555";
const DB_RE = (kind: string) => new RegExp(`^${kind}/${id}/[A-Za-z0-9._-]{1,80}$`);

describe("검수 사진 경로", () => {
  it("새 경로는 DB 검사·화면 검사를 둘 다 통과", () => {
    for (const kind of ["tx", "proxy"] as const) {
      const p = newPhotoPath(kind, id, 3);
      expect(DB_RE(kind).test(p)).toBe(true);
      expect(photoPathOk(kind, id, p)).toBe(true);
    }
  });
  it("다른 대상·종류·이상한 이름은 거부", () => {
    expect(photoPathOk("tx", id, `proxy/${id}/a.jpg`)).toBe(false);
    expect(photoPathOk("tx", id, `tx/22222222-2222-3333-4444-555555555555/a.jpg`)).toBe(false);
    expect(photoPathOk("tx", id, `tx/${id}/../a.jpg`)).toBe(false);
    expect(photoPathOk("tx", id, `tx/${id}/`)).toBe(false);
  });
});

describe("센터 발송 안내", () => {
  it("주문 번호를 주소 끝에 TOMO 와 함께 붙인다", () => {
    const l = centerShipLines({ recipient: "TOMO", postal: "286-0221", address: "千葉県富里市七栄649-114 建物内109", phone: null }, "TX000123");
    expect(l.address).toBe("千葉県富里市七栄649-114 建物内109 TOMO TX000123");
    expect(l.recipient).toBe("TOMO");
  });
  it("0057 한국 센터 = 받는 사람 뒤 괄호에 주문 번호, 주소·코드는 그대로", () => {
    const a = { recipient: "몽상앤코", postal: "48480", address: "부산광역시 남구 신선로 2, 부산지식산업센터(우암점) 303호 CA-0816", phone: "010" };
    const l = centerShipLines(a, "TX000123", { center: "SEOUL" });
    expect(l.recipient).toBe("몽상앤코 (TX000123)");
    expect(l.address).toBe(a.address);
  });
  it("0057 일본 센터 = 입고 예정 번호를 建物内109 뒤에, 번호 없으면 주소 없음", () => {
    const a = { recipient: "西岡 美奈子", postal: "286-0221", address: "千葉県富里市七栄649-114 建物内109", phone: null };
    expect(centerShipLines(a, "TX000123", { center: "NARITA", ref: "58213" }).address).toBe("千葉県富里市七栄649-114 建物内109 58213");
    expect(centerShipLines(a, "TX000123", { center: "NARITA", ref: null }).address).toBeNull();
    expect(centerShipLines(a, "TX000123", { center: "NARITA", ref: "58213" }).recipient).toBe("西岡 美奈子");
  });
  it("상자에 적힌 태그에서 TOMO 를 떼면 주문 번호로 읽힌다(센터 화면 검색)", () => {
    expect(parseOrderCode(centerMatchTag("TX000123").replace(/^TOMO\s*/i, ""))).toEqual({ kind: "tx", code: "TX000123" });
    expect(parseOrderCode(centerMatchTag("T000045").replace(/^TOMO\s*/i, ""))).toEqual({ kind: "po", code: "T000045" });
  });
});

describe("운영 API 번호 검색", () => {
  it("상자 태그·짧은 입력·uuid", () => {
    expect(opsCodeQ("TOMO TX000123")).toBe("TX000123");
    expect(opsCodeQ("tomo t45")).toBe("T000045");
    expect(opsCodeQ(id)).toBe(id);
    expect(opsCodeQ("")).toBe("");
  });
});

describe("운영 API 검수 경로", () => {
  it("조회·사진 자리·기록은 ops", () => {
    expect(matchOps("GET", ["inspections", "tx", id])?.route.need).toBe("ops");
    expect(matchOps("POST", ["inspections", "proxy", id, "upload"])?.route.need).toBe("ops");
    expect(matchOps("POST", ["inspections", "tx", id])?.route.need).toBe("ops");
    expect(matchOps("POST", ["inspections", "tx", id])?.params).toEqual(["tx", id]);
  });
});