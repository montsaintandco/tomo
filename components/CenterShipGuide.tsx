import { t, type Lang } from "@/lib/i18n";
import { centerShipLines, centerMatchTag } from "@/lib/inspection";

type Addr = { recipient: string; postal: string | null; address: string; phone: string | null };
const Row = ({ k, v }: { k: string; v: string }) => (
  <><dt className="font-bold text-ink">{k}</dt><dd className="select-all break-all text-ink">{v}</dd></>
);

// 판매자 센터 발송 안내(국제 거래, 결제 완료 뒤). 상자 매칭은 새 코드 없이 주문 번호를 주소 끝에 「TOMO TX000123」로 적게 한다(docs/aaa/12 T4).
// 주소는 center_addresses(0054). 못 읽으면 주소를 지어내지 않고 문의 안내만.
export default function CenterShipGuide({ addr, code, lang }: { addr: Addr | null; code: string; lang: Lang }) {
  const tag = centerMatchTag(code);
  if (!addr) return <p className="mb-4 rounded-card bg-tomo-navy/5 p-3.5 text-[13px] text-tomo-rose">{t(lang, "ship.noAddr")}</p>;
  const l = centerShipLines(addr, code);

  return (
    <section className="card mb-4 p-4 text-[13px]">
      <h2 className="mb-2 text-[14px] font-bold text-ink">{t(lang, "ship.title")}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <Row k={t(lang, "ship.recipient")} v={l.recipient} />
        {l.postal && <Row k={t(lang, "ship.postal")} v={l.postal} />}
        <Row k={t(lang, "ship.address")} v={l.address} />
        {l.phone && <Row k={t(lang, "ship.phone")} v={l.phone} />}
      </dl>
      <p className="mt-2 rounded-card bg-amber-50 p-2.5 text-[12px] font-bold leading-relaxed text-amber-900">{t(lang, "ship.codeNote", { tag })}</p>
      <p className="mt-1.5 text-[12px] text-ink-soft">{t(lang, "ship.afterNote")}</p>
    </section>
  );
}