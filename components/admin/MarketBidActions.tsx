"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marketBidAmount } from "@/lib/market-bid";
import { adminMbError, MB_OP_LABEL, type MbOp } from "@/lib/market-bid-admin";

// 입찰 대행 운영 조작(M5). POST /api/admin/market-bids(운영자 세션) → DB 0052 전이 + 서버 매입·승인 해제.
// 낙찰 처리는 매입 금액 미리보기 → 「확인」 → 브라우저 확인창(두 번 확인). 돈이 움직이는 조작(낙찰·못 넣음·운영 취소)은 되돌릴 수 없다
type Bid = { id: string; code: string; status: string; cap_jpy: number; last_bid_jpy: number | null; domestic_ship_jpy: number; rate: number; fee_jpy: number; auth_krw: number; ends_at: string };

const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const inputCls = "w-full rounded-md border border-[var(--a-border)] bg-white px-2 py-1 text-[12px]";

export default function MarketBidActions({ bid, op }: { bid: Bid; op: MbOp }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<string, string>>(() => ({
    amount: op === "placed" ? String(bid.last_bid_jpy ? bid.last_bid_jpy + 100 : "") : "",
    final_price: op === "won" ? String(bid.last_bid_jpy ?? "") : "", ship: String(bid.domestic_ship_jpy), note: "", ends_at: "", final_seen: "", price: "",
  }));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => { setV((x) => ({ ...x, [k]: e.target.value })); setStep(0); };
  const n = (k: string) => Number(v[k]);
  const money = op === "won" || op === "missed" || op === "cancel";
  const preview = op === "won" && n("final_price") > 0 ? marketBidAmount(n("final_price"), v.ship === "" ? bid.domestic_ship_jpy : n("ship"), Number(bid.rate), bid.fee_jpy) : null;

  async function run() {
    setMsg("");
    if (op === "won") {
      if (!preview) { setMsg("낙찰가를 적어 주세요"); return; }
      if (step === 0) { setStep(1); return; }   // 첫 확인: 미리보기 보여 주기
      if (!window.confirm(`${bid.code} 낙찰 처리: ${won(preview.total)}을 카드에서 매입하고 대행 주문(T 번호)을 만들어요. 되돌릴 수 없어요. 진행할까요?`)) return;
    } else if (money || op === "lost") {
      if (!window.confirm(`${bid.code} ${MB_OP_LABEL[op]}: 카드 승인을 해제해요. 되돌릴 수 없어요. 진행할까요?`)) return;
    }
    setBusy(true);
    const body: Record<string, unknown> = { id: bid.id, op, expected_status: bid.status, note: v.note, reason: v.note };
    if (op === "placed") Object.assign(body, { amount: n("amount"), ends_at: v.ends_at ? new Date(v.ends_at).toISOString() : "" });
    if (op === "outbid") Object.assign(body, { price: n("price") });
    if (op === "won") Object.assign(body, { final_price: n("final_price"), ship: v.ship });
    if (op === "lost") Object.assign(body, { final_seen: v.final_seen === "" ? null : n("final_seen") });
    const r = await fetch("/api/admin/market-bids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = await r?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!r?.ok && r?.status !== 202) {
      setMsg(j.status === "hold" ? `거절하고 보류로 바꿨어요: ${j.reason}(매입액 ${won(j.capture_krw ?? 0)} / 승인 ${won(j.auth_krw ?? 0)})` : adminMbError(String(j.error ?? "실패")));
      startTransition(() => router.refresh());
      return;
    }
    if (op === "won") setMsg(j.status === "ordered" ? `매입 완료 · 주문 ${j.order_code}` : `매입 대기(${j.status}) — 크론이 다시 해요${j.error ? `: ${j.error}` : ""}`);
    if ((op === "lost" || money) && j.released === false) setMsg(`처리됨. 승인 해제는 실패해 크론이 다시 해요: ${j.error}`);
    setOpen(false); setStep(0);
    startTransition(() => router.refresh());
  }

  const off = busy || isPending;
  if (!open) return (
    <span className="inline-flex flex-col items-end">
      <button type="button" onClick={() => setOpen(true)}
        className={`press rounded-full px-3 py-1.5 text-[12px] font-bold ${money ? "bg-tomo-coral-deep/10 text-tomo-coral-deep" : "bg-tomo-navy/5 text-tomo-navy"}`}>{MB_OP_LABEL[op]}</button>
      {msg && <span role="status" className="mt-1 text-[11px]">{msg}</span>}
    </span>
  );
  const f = (k: string, label: string, ph = "", type = "text") => (
    <label className="block w-full text-left text-[11px] font-semibold">{label}
      <input type={type} inputMode={type === "text" && k !== "note" ? "numeric" : undefined} value={v[k]} onChange={set(k)} placeholder={ph} className={inputCls} />
    </label>
  );
  return (
    <div className="flex w-full flex-col items-end gap-1.5 rounded-md border border-[var(--a-border)] p-2" data-op={op}>
      <p className="w-full text-left text-[12px] font-bold">{MB_OP_LABEL[op]} <span className="a-faint font-normal">상한 {yen(bid.cap_jpy)} · 승인 {won(bid.auth_krw)}</span></p>
      {op === "placed" && <>{f("amount", "넣은 입찰가(엔)", "상한가 이하")}{f("ends_at", "입찰 뒤 마감 시각(바뀌었으면)", "", "datetime-local")}</>}
      {op === "outbid" && f("price", "다른 입찰자 현재가(엔)")}
      {op === "won" && <>{f("final_price", "낙찰가(엔) — 메루카리는 우리 마지막 입찰액")}{f("ship", "일본 내 송료(엔)")}</>}
      {op === "lost" && f("final_seen", "마감 뒤 본 낙찰가(엔). 경매 자체가 취소됐으면 0")}
      {f("note", op === "placed" ? "증빙 메모(필수): 입찰 화면 확인 시각·내용" : "사유·메모(필수)")}
      {op === "won" && preview && (
        <dl className="grid w-full grid-cols-[1fr_auto] gap-x-2 rounded bg-tomo-navy/5 p-2 text-[12px]" data-testid="mb-capture-preview">
          <dt>상품 + 송료</dt><dd className="tnum text-right">{won(preview.subtotal)}</dd>
          <dt>국제배송</dt><dd className="tnum text-right">{won(preview.intl_shipping)}</dd>
          <dt>통관 예상</dt><dd className="tnum text-right">{won(preview.customs)}</dd>
          {preview.fee > 0 && <><dt>수수료</dt><dd className="tnum text-right">{won(preview.fee)}</dd></>}
          <dt className="font-bold">매입 금액</dt><dd className={`tnum text-right font-bold ${preview.total > bid.auth_krw ? "text-tomo-rose" : ""}`}>{won(preview.total)}</dd>
          <dt className="a-faint">승인액(상한)</dt><dd className="a-faint tnum text-right">{won(bid.auth_krw)}</dd>
          {preview.total > bid.auth_krw && <dd className="col-span-2 text-tomo-rose">승인액을 넘어요. 처리하면 거절되고 보류로 바뀌어요</dd>}
          {bid.last_bid_jpy != null && n("final_price") !== bid.last_bid_jpy && <dd className="col-span-2 text-tomo-rose">우리 마지막 입찰액({yen(bid.last_bid_jpy)})과 달라요. 처리하면 보류로 바뀌어요</dd>}
        </dl>
      )}
      <div className="flex gap-1.5">
        <button type="button" disabled={off} onClick={() => { setOpen(false); setStep(0); setMsg(""); }} className="press rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[12px] font-bold text-ink-soft">닫기</button>
        <button type="button" disabled={off} onClick={run}
          className={`press rounded-full px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-45 ${money ? "bg-tomo-coral-deep" : "bg-tomo-navy"}`}>
          {op === "won" ? (step === 0 ? "매입 금액 확인" : "낙찰 처리 실행") : `${MB_OP_LABEL[op]} 실행`}
        </button>
      </div>
      {msg && <p role="alert" className="text-[11px] text-tomo-rose">{msg}</p>}
    </div>
  );
}
