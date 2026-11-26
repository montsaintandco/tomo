import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, FilterTabs, fmtDate } from "@/components/admin/ui";
import ReportActions from "@/components/admin/ReportActions";
import { tableMissing } from "@/lib/safe";

const TYPE: Record<string, string> = { listing: "상품", user: "사용자", conversation: "채팅" };
const REASON: Record<string, string> = { spam: "스팸·광고", fraud: "사기 의심", prohibited: "금지 상품", abuse: "욕설·괴롭힘", other: "기타" };
const STATUS: Record<string, { label: string; tone: "red" | "green" | "gray" }> = {
  open: { label: "확인 필요", tone: "red" }, resolved: { label: "처리함", tone: "green" }, dismissed: { label: "기각", tone: "gray" },
};

type Row = {
  id: string; target_type: string; target_id: string; target_user_id: string | null; reason: string; detail: string;
  snapshot: { title?: string; nickname?: string; listing_id?: string; messages?: { body: string; image: boolean; at: string }[] };
  status: string; resolution_note: string; created_at: string;
  reporter: { nickname: string } | null; target: { nickname: string } | null;
};

// 신고 큐(0033) — 상품·사용자·채팅 신고. 접수 시점 증거(snapshot)를 함께 본다. 내비 링크는 T0(AdminNav)가 넣는다
export default async function AdminReportsPage(props: { searchParams: Promise<{ status?: string }> }) {
  const { status = "open" } = await props.searchParams;
  const supabase = await createServerSupabase();
  let q = supabase.from("reports")
    .select(`id, target_type, target_id, target_user_id, reason, detail, snapshot, status, resolution_note, created_at,
      reporter:profiles!reports_reporter_id_fkey(nickname), target:profiles!reports_target_user_id_fkey(nickname)`)
    .order("created_at", { ascending: false }).limit(200);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader title="신고" sub="상품·사용자·채팅 신고예요. 채팅 신고는 접수 때 상대가 보낸 최근 메시지 20개를 함께 저장해요" />
      <FilterTabs base="/admin/reports" param="status" current={status}
        options={[{ value: "open", label: "확인 필요" }, { value: "resolved", label: "처리함" }, { value: "dismissed", label: "기각" }, { value: "all", label: "전체" }]} />
      <Panel>
        {error && tableMissing(error) ? (
          <p className="a-faint p-4 text-[13px]">신고 표(0033)가 아직 적용되지 않았어요.</p>
        ) : (
          <Table head={["접수", "신고자", "대상", "사유", "증거", "상태", ""]} empty="신고가 없어요">
            {rows.map((r) => {
              const href = r.target_type === "listing" ? `/listings/${r.target_id}`
                : r.target_type === "user" ? `/profile/${r.target_id}`
                : r.snapshot.listing_id ? `/listings/${r.snapshot.listing_id}` : null;
              return (
                <tr key={r.id} className="align-top">
                  <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  <td className="whitespace-nowrap">{r.reporter?.nickname ?? "—"}</td>
                  <td className="max-w-[220px]">
                    <span className="a-faint mr-1 text-[11px]">{TYPE[r.target_type] ?? r.target_type}</span>
                    {href ? <Link href={href} className="a-link">{r.snapshot.title ?? r.snapshot.nickname ?? "열기"}</Link> : "—"}
                    {r.target_user_id && (
                      <p className="a-faint text-[12px]">책임: <Link href={`/profile/${r.target_user_id}`} className="a-link">{r.target?.nickname ?? "—"}</Link></p>
                    )}
                  </td>
                  <td className="max-w-[240px]">
                    <p className="whitespace-nowrap font-bold">{REASON[r.reason] ?? r.reason}</p>
                    {r.detail && <p className="whitespace-pre-wrap text-[12px]">{r.detail}</p>}
                  </td>
                  <td className="max-w-[360px]">
                    {r.snapshot.messages?.length ? (
                      <details>
                        <summary className="a-link cursor-pointer text-[12px]">메시지 {r.snapshot.messages.length}개</summary>
                        <ul className="mt-1 space-y-1 text-[12px]">
                          {r.snapshot.messages.map((m, i) => (
                            <li key={i}><span className="a-faint tnum mr-1">{fmtDate(m.at)}</span>{m.body || (m.image ? "[사진]" : "")}</li>
                          ))}
                        </ul>
                      </details>
                    ) : <span className="a-faint">—</span>}
                    {r.resolution_note && <p className="mt-1 rounded-md bg-[var(--a-active)] px-2 py-1 text-[12px]">메모: {r.resolution_note}</p>}
                  </td>
                  <td><Pill tone={STATUS[r.status]?.tone ?? "gray"}>{STATUS[r.status]?.label ?? r.status}</Pill></td>
                  <td className="text-right"><ReportActions id={r.id} status={r.status} targetType={r.target_type} targetId={r.target_id} /></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>
    </>
  );
}
