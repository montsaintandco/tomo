import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel } from "@/components/admin/ui";
import { BannerCard, NewBannerButton } from "@/components/admin/BannerForm";
import { BANNER_COLS, BANNER_SIZE, type BannerRow } from "@/lib/banners";
import { rows, tableMissing } from "@/lib/safe";

// 홈 배너 — 뷰어 나라(KR/JP/전체)별 홈 띠. 저장 즉시 홈 반영(홈은 요청마다 렌더)
export default async function AdminBannersPage() {
  const supabase = await createServerSupabase();
  const res = await supabase.from("banners").select(BANNER_COLS).order("sort_order").order("created_at");
  const list = rows(res as unknown as { data: BannerRow[] | null; error: { code?: string } | null });
  const missing = tableMissing(res.error);

  return (
    <>
      <PageHeader title="배너" sub={`홈 검색·카테고리 아래 띠. 대상은 뷰어 나라(로그인=프로필 나라, 게스트=언어) 기준. 권장 ${BANNER_SIZE.w}×${BANNER_SIZE.h}(${BANNER_SIZE.ratio}), 켜짐·기간 안인 것만 순서대로 노출`} />
      {missing ? (
        <Panel><p className="a-muted p-6 text-center text-[13px]">banners 표가 없어요. 마이그레이션 0029_content.sql 을 적용하면 쓸 수 있어요.</p></Panel>
      ) : res.error ? (
        <Panel><p className="p-6 text-center text-[13px] text-tomo-rose">배너를 불러오지 못했어요: {res.error.message}</p></Panel>
      ) : (
        <Panel title="배너" count={list.length}>
          <div className="flex flex-col gap-2 p-3">
            <NewBannerButton nextOrder={(list.at(-1)?.sort_order ?? 0) + 10} />
            {list.map((b) => <BannerCard key={b.id} banner={b} />)}
            {list.length === 0 && <p className="a-muted py-6 text-center text-[12px]">배너가 없으면 홈에 띠가 나오지 않아요</p>}
          </div>
        </Panel>
      )}
    </>
  );
}
