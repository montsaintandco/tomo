"use client";
import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useGridSelection } from "@/components/admin/use-grid-selection";
import AdminToggle from "@/components/AdminToggle";
import { CountryChip } from "@/components/Brand";
import ReleaseHoldButton from "@/components/admin/ReleaseHoldButton";

export type AdminListingRow = {
  id: string; title: string; price: number; currency: string; status: string; country: "KR" | "JP"; region: string;
  image: string | null; hidden: boolean; hidden_by_admin: boolean; view_count: number; created_at: string; seller: string | null; editHref: string;
};

const STATUS: Record<string, { label: string; tone: string }> = {
  active: { label: "판매중", tone: "green" }, reserved: { label: "예약중", tone: "amber" }, sold: { label: "거래완료", tone: "gray" },
  held: { label: "보류(반송 확인 필요)", tone: "red" },   // 0041: 발송 뒤 취소·분쟁 환불
};
const money = (n: number, cur: string) => (cur === "JPY" ? `¥${n.toLocaleString("en-US")}` : `${n.toLocaleString("en-US")}원`);
const date = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// 상품 표 — 체크해서 한꺼번에 운영 숨김·복구(선택 규칙은 use-grid-selection: 화면에 보이는 행만 대상, 성공한 건만 선택에서 뺀다)
export default function ListingsTable({ rows }: { rows: AdminListingRow[] }) {
  const idOf = useCallback((r: AdminListingRow) => r.id, []);
  const sel = useGridSelection(rows, idOf);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function bulk(hidden: boolean) {
    const targets = sel.checkedRows.filter((r) => r.hidden_by_admin !== hidden);
    if (!targets.length) { setMsg(hidden ? "이미 모두 숨김이에요" : "숨김인 상품이 없어요"); return; }
    if (hidden && !window.confirm(`${targets.length}개 상품을 숨길까요? 판매자는 되살릴 수 없어요.`)) return;
    setBusy(true); setMsg("");
    const supabase = createBrowserSupabase();
    const ok: string[] = []; let fail = 0;
    for (const r of targets) {
      const { error } = await supabase.rpc("admin_set_listing_hidden", { p_id: r.id, p_hidden: hidden });
      if (error) fail++; else ok.push(r.id);
    }
    setBusy(false);
    sel.remove(ok);
    setMsg(`${ok.length}개 ${hidden ? "숨김" : "복구"}${fail ? ` · 실패 ${fail}개(선택에 남겨 둠)` : ""}`);
    startTransition(() => router.refresh());
  }

  const off = busy || isPending;
  return (
    <>
      {sel.checked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--a-border)] bg-[var(--a-hover)] px-3 py-2 text-[12px]">
          <span className="font-semibold tnum">{sel.checked.size}개 선택</span>
          <button type="button" disabled={off} onClick={() => bulk(true)} className="btn h-7 bg-tomo-coral-deep/10 px-2.5 text-[12px] text-tomo-coral-deep">운영 숨김</button>
          <button type="button" disabled={off} onClick={() => bulk(false)} className="btn h-7 bg-tomo-navy/5 px-2.5 text-[12px] text-tomo-navy">복구</button>
          <button type="button" disabled={off} onClick={sel.clear} className="a-link ml-auto">선택 해제</button>
        </div>
      )}
      {msg && <p role="status" className="a-muted px-3 py-1.5 text-[12px]">{msg}</p>}
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th className="w-8">
                <input type="checkbox" aria-label="이 페이지 전체 선택" checked={sel.isPageAllChecked(rows)}
                  ref={(el) => { if (el) el.indeterminate = sel.isPageIndeterminate(rows); }}
                  onChange={(e) => sel.togglePage(rows, e.target.checked)} />
              </th>
              {["상품", "판매자", "가격", "상태", "조회", "등록", ""].map((h, i) => <th key={i}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="a-muted py-10 text-center text-[13px]">상품이 없어요</td></tr>}
            {rows.map((l) => (
              <tr key={l.id}>
                <td><input type="checkbox" aria-label={`${l.title} 선택`} checked={sel.checked.has(l.id)} onChange={(e) => sel.toggle(l.id, e.target.checked)} /></td>
                <td>
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-8 w-8 shrink-0 overflow-hidden rounded-md border border-[var(--a-border)] bg-[var(--a-hover)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {l.image && <img src={l.image} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    </span>
                    <span className="min-w-0">
                      <Link href={`/listings/${l.id}`} className="a-link block max-w-[260px] truncate">{l.title}</Link>
                      <span className="a-muted flex items-center gap-1 text-[12px]"><CountryChip country={l.country} />{l.region}</span>
                    </span>
                  </span>
                </td>
                <td className="whitespace-nowrap">{l.seller}</td>
                <td className="tnum whitespace-nowrap">{l.price === 0 ? "나눔" : money(l.price, l.currency)}</td>
                <td>
                  <span className="flex flex-wrap gap-1">
                    <span className="a-pill" data-tone={STATUS[l.status]?.tone ?? "gray"}>{STATUS[l.status]?.label ?? l.status}</span>
                    {l.hidden && <span className="a-pill" data-tone={l.hidden_by_admin ? "red" : "gray"}>{l.hidden_by_admin ? "운영 숨김" : "셀러 숨김"}</span>}
                  </span>
                </td>
                <td className="tnum">{l.view_count}</td>
                <td className="a-faint tnum whitespace-nowrap">{date(l.created_at)}</td>
                <td className="text-right">
                  <span className="inline-flex items-center gap-1.5">
                    {l.status === "held" && <ReleaseHoldButton listingId={l.id} title={l.title} />}
                    <Link href={l.editHref} scroll={false} className="a-link text-[12px]">수정</Link>
                    <AdminToggle label={l.hidden_by_admin ? "복구" : "숨김"} danger={!l.hidden_by_admin}
                      action={{ rpc: "admin_set_listing_hidden", args: { p_id: l.id, p_hidden: !l.hidden_by_admin } }} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
