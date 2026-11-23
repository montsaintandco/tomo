import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, fmtDate } from "@/components/admin/ui";
import { tableMissing } from "@/lib/safe";

// AI 답변 로그(0030) — 고객이 봇 입력창에 물은 것과 AI 답. 답 못 한 질문을 보고 봇 트리·FAQ 문구를 보강하는 데 쓴다. 읽기 전용
export default async function AdminSupportAiPage() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("support_ai_log")
    .select("id, user_id, lang, model, question, answer, ok, created_at, profiles(nickname)")
    .order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as unknown as {
    id: number; user_id: string | null; lang: string; model: string; question: string; answer: string; ok: boolean; created_at: string; profiles: { nickname: string } | null;
  }[];

  return (
    <>
      <PageHeader title="AI 답변 로그" sub={tableMissing(error) ? "0030 마이그레이션이 아직 적용되지 않았어요" : "봇 입력창 질문과 AI 답 최근 200건. 상담원 연결이 필요한 답은 끝에 표시가 붙어요"} />
      <Panel>
        <Table head={["시각", "사용자", "언어", "질문", "답", "결과"]} empty="기록이 없어요">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.created_at)}</td>
              <td className="whitespace-nowrap">{r.user_id ? (r.profiles?.nickname ?? "회원") : <span className="a-faint">비로그인</span>}</td>
              <td>{r.lang}</td>
              <td className="max-w-[280px] whitespace-pre-wrap">{r.question}</td>
              <td className="max-w-[420px] whitespace-pre-wrap text-[12px]">{r.answer}</td>
              <td><Pill tone={!r.ok ? "red" : r.answer.includes("<<AGENT>>") ? "amber" : "green"}>{!r.ok ? "실패" : r.answer.includes("<<AGENT>>") ? "상담원" : "답변"}</Pill></td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
