import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel } from "@/components/admin/ui";
import TrendingThemeCard from "@/components/TrendingThemeCard";
import NewThemeButton from "@/components/NewThemeButton";
import type { ThemeRow } from "@/components/TrendingThemeForm";

// 홈 "지금 인기" 큐레이션 — 뷰어 나라별 테마. 저장 후 최대 10분 뒤 홈 반영
export default async function AdminTrendingPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("trending_themes")
    .select("id, country, key, label, label_ja, term, sources, sort_order, active")
    .order("country").order("sort_order");
  const rows = (data ?? []) as (ThemeRow & { id: string })[];

  return (
    <>
      <PageHeader title="큐레이션" sub="홈 「지금 인기」 캐러셀(앞 4개)과 「상대국 친구들이 찾는 것」 칩(전부)의 원천. KR = 한국 뷰어가 보는 일본 마켓 테마, JP = 일본 뷰어가 보는 한국 마켓 테마" />
      <div className="grid gap-4 lg:grid-cols-2">
        {(["KR", "JP"] as const).map((c) => {
          const list = rows.filter((r) => r.country === c);
          return (
            <Panel key={c} title={c === "KR" ? "KR 뷰어 → 일본 마켓" : "JP 뷰어 → 한국 마켓"} count={list.length}
              actions={<NewThemeButton country={c} nextOrder={(list.at(-1)?.sort_order ?? 0) + 1} />}>
              <div className="flex flex-col gap-2 p-3">
                {list.map((r) => <TrendingThemeCard key={r.id} theme={r} />)}
                {list.length === 0 && <p className="a-muted py-6 text-center text-[12px]">테마가 없으면 코드 기본값으로 표시돼요</p>}
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
