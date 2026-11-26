import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { PageHeader, Panel, Table, Pill, FilterTabs, Pager, Avatar, fmtDate } from "@/components/admin/ui";
import { likeEscape, pageOf } from "@/components/admin/paging";
import AdminToggle from "@/components/AdminToggle";
import AdminDeleteUserButton from "@/components/AdminDeleteUserButton";
import { CountryChip } from "@/components/Brand";
import Link from "next/link";
import { redirect } from "next/navigation";

const FILTERS = [{ value: "", label: "전체" }, { value: "admin", label: "운영자" }, { value: "suspended", label: "정지" }];

// 사용자 — 정지/해제, 운영자 부여/해제, 완전 삭제(service_role). 정지되면 글쓰기 전부 막히고 판매중 상품이 숨겨진다
export default async function AdminUsersPage(props: { searchParams: Promise<{ q?: string; f?: string; page?: string }> }) {
  const sp = await props.searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const f = FILTERS.some((x) => x.value === sp.f) ? sp.f ?? "" : "";
  const { page, from, to, size } = pageOf(sp.page);
  const params = { q: q || undefined, f: f || undefined, page: page > 1 ? String(page) : undefined };
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/admin/users");

  let query = supabase.from("profiles")
    .select("id, nickname, country, region, language, trust_temp, is_admin, suspended, created_at", { count: "exact" })
    .order("created_at", { ascending: false }).range(from, to);
  if (q) query = query.ilike("nickname", `%${likeEscape(q)}%`);
  if (f === "admin") query = query.eq("is_admin", true);
  if (f === "suspended") query = query.eq("suspended", true);
  const { data, count } = await query;
  const rows = (data ?? []) as { id: string; nickname: string; country: "KR" | "JP"; region: string; language: string; trust_temp: number; is_admin: boolean; suspended: boolean; created_at: string }[];

  return (
    <>
      <PageHeader title="사용자" sub={`${count ?? rows.length}명 · 최근 가입순`}
        actions={
          <form className="flex gap-2" role="search">
            {f && <input type="hidden" name="f" value={f} />}
            <input name="q" defaultValue={q} placeholder="닉네임 검색" aria-label="닉네임 검색" className="h-8 w-56 px-3 text-[13px]" />
            <button className="btn h-8 bg-tomo-navy px-3 text-[12px] text-white">검색</button>
          </form>
        } />
      <FilterTabs base="/admin/users" param="f" options={FILTERS} current={f} keep={params} />
      <Panel>
        <Table head={["사용자", "지역", "언어", "온도", "권한", "가입", ""]} empty="사용자가 없어요">
          {rows.map((u) => (
            <tr key={u.id}>
              <td>
                <Link href={`/admin/users/${u.id}`} className="flex items-center gap-2">
                  <Avatar name={u.nickname} />
                  <span className="a-link">{u.nickname}</span>
                </Link>
              </td>
              <td className="whitespace-nowrap"><span className="flex items-center gap-1"><CountryChip country={u.country} />{u.region}</span></td>
              <td className="a-muted">{u.language === "ja" ? "日本語" : "한국어"}</td>
              <td className="tnum">{Number(u.trust_temp).toFixed(1)}°</td>
              <td>
                <span className="flex gap-1">
                  {u.is_admin && <Pill tone="navy">운영자</Pill>}
                  {u.suspended && <Pill tone="red">정지</Pill>}
                  {!u.is_admin && !u.suspended && <span className="a-faint">—</span>}
                </span>
              </td>
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(u.created_at)}</td>
              <td className="text-right">
                <span className="flex flex-wrap justify-end gap-1">
                  <AdminToggle label={u.suspended ? "정지 해제" : "정지"} danger={!u.suspended}
                    confirmText={u.suspended ? undefined : `${u.nickname} 님을 정지할까요? 글쓰기가 막히고 판매중 상품이 숨겨져요.`}
                    action={{ rpc: "admin_set_user", args: { p_id: u.id, p_suspended: !u.suspended, p_admin: u.is_admin } }} />
                  {u.id !== viewer.id && (
                    <>
                      <AdminToggle label={u.is_admin ? "운영자 해제" : "운영자 부여"}
                        confirmText={u.is_admin ? undefined : `${u.nickname} 님에게 운영자 권한을 줄까요?`}
                        action={{ rpc: "admin_set_user", args: { p_id: u.id, p_suspended: u.suspended, p_admin: !u.is_admin } }} />
                      <AdminDeleteUserButton userId={u.id} nickname={u.nickname} />
                    </>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </Table>
        <Pager base="/admin/users" params={params} page={page} size={size} total={count} shown={rows.length} />
      </Panel>
    </>
  );
}
