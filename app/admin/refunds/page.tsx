import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, fmtDate, money, type Tone } from "@/components/admin/ui";
import { rows, tableMissing } from "@/lib/safe";
import RefundRetry from "@/components/admin/RefundRetry";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "대기", tone: "amber" }, failed: { label: "실패", tone: "red" }, done: { label: "완료", tone: "green" },
};

type Refund = {
  id: string; kind: "tx" | "proxy_order"; transaction_id: string | null; proxy_order_id: string | null; proxy_request_id: string | null;
  amount: number; currency: string; amount_krw: number | null; is_full: boolean; reason: string; status: string;
  attempts: number; last_error: string | null; created_at: string; done_at: string | null; profiles: { nickname: string } | null;
};

const SELECT = "id, kind, transaction_id, proxy_order_id, proxy_request_id, amount, currency, amount_krw, is_full, reason, status, attempts, last_error, created_at, done_at, profiles!refunds_user_id_fkey(nickname)";

// 환불 원장 — DB 취소는 끝났는데 토스 취소가 안 된 건(대기·실패)을 다시 보낸다. 완료는 최근 100건
export default async function AdminRefundsPage() {
  const supabase = await createServerSupabase();
  const [openRes, doneRes] = await Promise.all([
    supabase.from("refunds").select(SELECT).in("status", ["pending", "failed"]).order("created_at", { ascending: true }).limit(200),
    supabase.from("refunds").select(SELECT).eq("status", "done").order("done_at", { ascending: false }).limit(100),
  ]);
  const missing = tableMissing(openRes.error);
  const open = rows(openRes) as unknown as Refund[];
  const done = rows(doneRes) as unknown as Refund[];

  const Row = ({ r, retry }: { r: Refund; retry: boolean }) => (
    <tr className="align-top">
      <td className="whitespace-nowrap">
        {r.kind === "tx"
          ? <Link href={`/transactions/${r.transaction_id}`} className="a-link">거래 {r.transaction_id?.slice(0, 8)}</Link>
          : <Link href={`/order/${r.proxy_order_id}`} className="a-link">주문 {r.proxy_order_id?.slice(0, 8)}</Link>}
        {r.proxy_request_id && <Link href={`/proxy/${r.proxy_request_id}`} className="a-link a-muted block text-[12px]">항목 {r.proxy_request_id.slice(0, 8)}</Link>}
      </td>
      <td className="whitespace-nowrap">{r.profiles?.nickname ?? "—"}</td>
      <td className="tnum whitespace-nowrap">
        {money(r.amount, r.currency)}{r.is_full && <span className="a-faint ml-1 text-[11px]">잔액 전부</span>}
        {r.amount_krw != null && <span className="a-faint block text-[11px]">토스 {money(r.amount_krw, "KRW")}</span>}
      </td>
      <td className="max-w-[260px]"><span className="block whitespace-pre-wrap text-[12px]">{r.reason}</span></td>
      <td>
        <Pill tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</Pill>
        {r.attempts > 0 && <span className="a-faint tnum block text-[11px]">시도 {r.attempts}</span>}
        {r.last_error && <span className="block max-w-[220px] break-words text-[11px] text-tomo-rose">{r.last_error}</span>}
      </td>
      <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.done_at ?? r.created_at)}</td>
      <td>{retry && <RefundRetry id={r.id} />}</td>
    </tr>
  );

  return (
    <>
      <PageHeader title="환불" sub="취소 처리 후 토스 환불이 안 끝난 건을 다시 보내요. 같은 환불은 두 번 나가지 않습니다(Idempotency-Key)" />
      {missing && <Panel className="mb-4"><p className="a-muted p-4 text-[13px]">환불 원장(0025 마이그레이션)이 아직 적용되지 않았어요.</p></Panel>}
      <Panel title="처리 필요" count={open.length} className="mb-4">
        <Table head={["대상", "받는 사람", "금액", "사유", "상태", "생성", ""]} empty="대기 중인 환불이 없어요">
          {open.map((r) => <Row key={r.id} r={r} retry />)}
        </Table>
      </Panel>
      <Panel title="완료" count={done.length}>
        <Table head={["대상", "받는 사람", "금액", "사유", "상태", "완료", ""]} empty="아직 없음">
          {done.map((r) => <Row key={r.id} r={r} retry={false} />)}
        </Table>
      </Panel>
    </>
  );
}
