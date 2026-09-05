import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, FilterTabs, fmtDate } from "@/components/admin/ui";
import SupportReply from "@/components/admin/SupportReply";

const CAT: Record<string, string> = { before: "주문 전", after: "주문 후", sell: "판매", travel: "여행 직거래" };
const STATUS: Record<string, { label: string; tone: "red" | "green" | "gray" }> = {
  open: { label: "답변 필요", tone: "red" }, answered: { label: "답변함", tone: "green" }, closed: { label: "닫힘", tone: "gray" },
};

// 문의 큐 — 봇의 "상담원 연결"이 남긴 티켓. 행을 펼쳐 답변(한 번) 또는 닫기. 답변은 사용자 마이페이지 → 문의에 보인다
export default async function AdminSupportPage(props: { searchParams: Promise<{ status?: string }> }) {
  const { status = "open" } = await props.searchParams;
  const supabase = await createServerSupabase();
  let q = supabase.from("support_tickets")
    .select("id, category, item_url, item_option, quantity, order_ref, body, status, reply, created_at, profiles(nickname, country, language)")
    .order("created_at", { ascending: false }).limit(200);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  const rows = (data ?? []) as unknown as {
    id: string; category: string; item_url: string | null; item_option: string | null; quantity: number | null; order_ref: string | null;
    body: string; status: string; reply: string | null; created_at: string; profiles: { nickname: string; country: string; language: string } | null;
  }[];

  return (
    <>
      <PageHeader title="문의" sub="지원 봇에서 '상담원 연결'로 들어온 문의예요. 답변은 한 번, 이어지는 질문은 새 문의로 들어와요" />
      <FilterTabs base="/admin/support" param="status" current={status}
        options={[{ value: "open", label: "답변 필요" }, { value: "answered", label: "답변함" }, { value: "closed", label: "닫힘" }, { value: "all", label: "전체" }]} />
      <Panel>
        <Table head={["접수", "사용자", "분류", "내용", "상태", ""]} empty="문의가 없어요">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.created_at)}</td>
              <td className="whitespace-nowrap">{r.profiles?.nickname ?? "—"}<span className="a-faint ml-1 text-[11px]">{r.profiles?.country}·{r.profiles?.language}</span></td>
              <td className="whitespace-nowrap">{CAT[r.category] ?? r.category}</td>
              <td className="max-w-[420px]">
                {r.item_url && <a href={r.item_url} target="_blank" rel="noopener noreferrer" className="a-link block truncate">{r.item_url}</a>}
                {(r.item_option || r.quantity) && <p className="a-faint text-[12px]">{[r.item_option, r.quantity ? `${r.quantity}개` : null].filter(Boolean).join(" · ")}</p>}
                {r.order_ref && <p className="a-faint text-[12px]">주문: {r.order_ref}</p>}
                <p className="whitespace-pre-wrap">{r.body}</p>
                {r.reply && <p className="mt-1 rounded-md bg-[var(--a-active)] px-2 py-1 text-[12px]">답변: {r.reply}</p>}
              </td>
              <td><Pill tone={STATUS[r.status]?.tone ?? "gray"}>{STATUS[r.status]?.label ?? r.status}</Pill></td>
              <td className="text-right"><SupportReply id={r.id} status={r.status} /></td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
