import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import AdminToggle from "@/components/AdminToggle";
import AdminDeleteUserButton from "@/components/AdminDeleteUserButton";
import { CountryChip } from "@/components/Brand";
import Link from "next/link";
import { redirect } from "next/navigation";

// 사용자 관리 — 정지/해제, 운영자 부여/해제. 정지되면 글쓰기 전부 막히고 판매중 상품이 숨겨진다
export default async function AdminUsersPage(props: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await props.searchParams;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/admin/users");
  if (!viewer.isAdmin) redirect("/");

  let query = supabase.from("profiles")
    .select("id, nickname, country, region, trust_temp, is_admin, suspended, created_at")
    .order("created_at", { ascending: false }).limit(100);
  if (q) query = query.ilike("nickname", `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`);
  const { data } = await query;
  const rows = (data ?? []) as {
    id: string; nickname: string; country: "KR" | "JP"; region: string; trust_temp: number;
    is_admin: boolean; suspended: boolean; created_at: string;
  }[];

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-3xl md:px-6 md:pb-16 md:pt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[17px] font-extrabold leading-tight text-ink md:text-xl">사용자 관리</h1>
        <Link href="/admin" className="press text-[13px] font-bold text-tomo-navy">← 운영</Link>
      </div>
      <form className="mb-3 flex gap-2" role="search">
        <input name="q" defaultValue={q ?? ""} placeholder="닉네임 검색" className="min-w-0 flex-1 rounded-full bg-tomo-ivory px-4 py-2.5 text-base placeholder:text-ink-soft" />
        <button className="btn bg-tomo-navy px-4 py-2 text-sm text-white">검색</button>
      </form>

      <div className="flex flex-col gap-2">
        {rows.map((u) => (
          <div key={u.id} className="card flex flex-wrap items-center gap-3 p-3">
            <Link href={`/profile/${u.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tomo-navy/5 text-sm font-bold text-tomo-navy">{u.nickname.slice(0, 1)}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                  <span className="truncate">{u.nickname}</span>
                  {u.is_admin && <span className="rounded-full bg-tomo-navy px-2 py-0.5 text-[11px] text-white">운영자</span>}
                  {u.suspended && <span className="rounded-full bg-tomo-coral-deep px-2 py-0.5 text-[11px] text-white">정지</span>}
                </span>
                <span className="flex items-center gap-1.5 text-[12px] text-ink-soft"><CountryChip country={u.country} />{u.region} · <span className="tnum">{Number(u.trust_temp).toFixed(1)}°</span></span>
              </span>
            </Link>
            <span className="flex shrink-0 gap-1.5">
              <AdminToggle label={u.suspended ? "정지 해제" : "정지"} danger={!u.suspended}
                confirmText={u.suspended ? undefined : `${u.nickname} 님을 정지할까요? 글쓰기가 막히고 판매중 상품이 숨겨져요.`}
                action={{ rpc: "admin_set_user", args: { p_id: u.id, p_suspended: !u.suspended, p_admin: u.is_admin } }} />
              {u.id !== viewer.id && (
                <AdminToggle label={u.is_admin ? "운영자 해제" : "운영자 부여"}
                  confirmText={u.is_admin ? undefined : `${u.nickname} 님에게 운영자 권한을 줄까요?`}
                  action={{ rpc: "admin_set_user", args: { p_id: u.id, p_suspended: u.suspended, p_admin: !u.is_admin } }} />
              )}
              {u.id !== viewer.id && <AdminDeleteUserButton userId={u.id} nickname={u.nickname} />}
            </span>
          </div>
        ))}
        {rows.length === 0 && <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">사용자가 없어요</p>}
      </div>
    </main>
  );
}
