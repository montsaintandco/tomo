import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel } from "@/components/admin/ui";
import { NoticeCard, NewNoticeButton } from "@/components/admin/NoticeForm";
import { NOTICE_COLS, type NoticeRow } from "@/lib/notices";
import { rows, tableMissing } from "@/lib/safe";

// 공지 — 고객 /notice 의 정본. 게시된 것만 고정 먼저·최신 먼저 노출. 0건이면 /notice 는 코드 목록(lib/notices.ts)을 보여 준다
export default async function AdminNoticesPage() {
  const supabase = await createServerSupabase();
  const res = await supabase.from("notices").select(NOTICE_COLS)
    .order("pinned", { ascending: false }).order("published_on", { ascending: false }).order("created_at", { ascending: false });
  const list = rows(res as unknown as { data: NoticeRow[] | null; error: { code?: string } | null });
  const missing = tableMissing(res.error);

  return (
    <>
      <PageHeader title="공지" sub="고객 화면 /notice. 제목·본문은 한국어·일본어 둘 다, 뷰어 언어로 보여요. 저장 즉시 반영" />
      {missing ? (
        <Panel><p className="a-muted p-6 text-center text-[13px]">notices 표가 없어요. 마이그레이션 0029_content.sql 을 적용하면 쓸 수 있어요. 지금 /notice 는 코드 목록을 보여 줘요.</p></Panel>
      ) : res.error ? (
        <Panel><p className="p-6 text-center text-[13px] text-tomo-rose">공지를 불러오지 못했어요: {res.error.message}</p></Panel>
      ) : (
        <Panel title="공지" count={list.length}>
          <div className="flex flex-col gap-2 p-3">
            <NewNoticeButton />
            {list.map((n) => <NoticeCard key={n.id} notice={n} />)}
            {list.length === 0 && <p className="a-muted py-6 text-center text-[12px]">공지가 없으면 /notice 는 코드 목록을 보여 줘요</p>}
          </div>
        </Panel>
      )}
    </>
  );
}
