import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import TrendingThemeCard from "@/components/TrendingThemeCard";
import NewThemeButton from "@/components/NewThemeButton";
import type { ThemeRow } from "@/components/TrendingThemeForm";
import Link from "next/link";
import { redirect } from "next/navigation";

// 홈 "지금 인기" 큐레이션 — 뷰어 나라별 테마 목록. 변경은 10분 캐시 후 홈에 반영
export default async function AdminTrendingPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/admin/trending");
  if (!viewer.isAdmin) redirect("/");
  const { data } = await supabase.from("trending_themes")
    .select("id, country, key, label, label_ja, term, sources, sort_order, active")
    .order("country").order("sort_order");
  const rows = (data ?? []) as (ThemeRow & { id: string })[];

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-2xl md:px-6 md:pb-16 md:pt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[17px] font-extrabold leading-tight text-ink md:text-xl">인기 큐레이션</h1>
        <Link href="/admin" className="press text-[13px] font-bold text-tomo-navy">← 운영</Link>
      </div>
      <p className="mb-4 rounded-card bg-tomo-navy/5 p-3.5 text-[13px] leading-relaxed text-ink">
        홈 &ldquo;지금 인기&rdquo; 캐러셀과 &ldquo;상대국 친구들이 찾는 것&rdquo; 칩의 원천이에요. KR = 한국 뷰어가 보는 일본 마켓 테마, JP = 일본 뷰어가 보는 한국 마켓 테마.
        홈은 앞 4개(순서 기준)만 캐러셀로, 팔기 칩은 전부. 저장 후 최대 10분 뒤 반영.
      </p>
      {(["KR", "JP"] as const).map((c) => (
        <section key={c} className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-extrabold text-ink">{c === "KR" ? "KR 뷰어 → 일본 마켓" : "JP 뷰어 → 한국 마켓"}</h2>
            <NewThemeButton country={c} nextOrder={(rows.filter((r) => r.country === c).at(-1)?.sort_order ?? 0) + 1} />
          </div>
          <div className="flex flex-col gap-2">
            {rows.filter((r) => r.country === c).map((r) => <TrendingThemeCard key={r.id} theme={r} />)}
            {rows.filter((r) => r.country === c).length === 0 && (
              <p className="rounded-card bg-tomo-ivory p-3 text-center text-xs text-ink-soft">테마가 없으면 코드 기본값으로 표시돼요</p>
            )}
          </div>
        </section>
      ))}
    </main>
  );
}
