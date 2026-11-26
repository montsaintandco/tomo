import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, FilterTabs, fmtDate, type Tone } from "@/components/admin/ui";
import { tableMissing } from "@/lib/safe";

const SRC: Record<string, { label: string; tone: Tone }> = {
  server: { label: "서버", tone: "red" },
  client: { label: "브라우저", tone: "amber" },
  csp: { label: "CSP 위반", tone: "gray" },
};

// 오류 기록(0032) — 같은 오류는 한 줄로 합쳐 횟수만 오른다. ref 는 고객 화면 오류 안내의 ref 와 같다. 30일 지나면 지워진다. 읽기 전용
export default async function AdminErrorsPage(props: { searchParams: Promise<{ source?: string }> }) {
  const { source = "" } = await props.searchParams;
  const supabase = await createServerSupabase();
  let q = supabase.from("error_events").select("id, source, digest, message, stack, path, count, first_at, last_at, profiles(nickname)")
    .order("last_at", { ascending: false }).limit(200);
  if (SRC[source]) q = q.eq("source", source);
  const { data, error } = await q;
  const rows = (data ?? []) as unknown as {
    id: number; source: string; digest: string; message: string; stack: string | null; path: string | null; count: number; first_at: string; last_at: string; profiles: { nickname: string } | null;
  }[];

  return (
    <>
      <PageHeader title="오류" sub={tableMissing(error) ? "0032 마이그레이션이 아직 적용되지 않았어요" : "최근에 다시 난 순서로 200줄. 줄을 누르면 스택이 보여요"} />
      <FilterTabs base="/admin/errors" param="source" current={SRC[source] ? source : ""}
        options={[{ value: "", label: "전체" }, ...Object.entries(SRC).map(([value, m]) => ({ value, label: m.label }))]} />
      <Panel>
        <Table head={["마지막", "출처", "내용", "경로", "횟수", "처음", "ref"]} empty="기록된 오류가 없어요">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.last_at)}</td>
              <td><Pill tone={SRC[r.source]?.tone}>{SRC[r.source]?.label ?? r.source}</Pill></td>
              <td className="max-w-[460px]">
                <details>
                  <summary className="cursor-pointer break-words">{r.message}{r.profiles && <span className="a-faint ml-1.5 text-[11px]">· {r.profiles.nickname}</span>}</summary>
                  {r.stack && <pre className="a-muted mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px]">{r.stack}</pre>}
                </details>
              </td>
              <td className="a-muted max-w-[200px] truncate">{r.path ?? "—"}</td>
              <td className="tnum">{r.count}</td>
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.first_at)}</td>
              <td className="a-faint tnum text-[11px]">{r.digest}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
