import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import MyNav from "@/components/mypage/MyNav";
import { myBadges } from "@/components/mypage/counts";

// 마이페이지 셸 — 데스크톱은 왼쪽 메뉴 + 본문, 모바일은 본문만(홈이 메뉴 목록, 하위 화면은 뒤로가기 줄).
export default async function MyPageLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage");
  const badges = await myBadges(supabase, viewer.id);
  return (
    <div className="mx-auto md:flex md:max-w-5xl md:gap-8 md:px-6 md:pt-8">
      <MyNav lang={viewer.language} badges={badges} isAdmin={viewer.isAdmin} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
