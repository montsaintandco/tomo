"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import AdminToggle from "@/components/AdminToggle";
import type { NoticeRow } from "@/lib/notices";

// 공지 작성·수정 — RLS 가 관리자만 통과 (한국어 고정 운영 화면). 고객 화면 /notice 는 게시된 것만
type Draft = Pick<NoticeRow, "published_on" | "title_ko" | "title_ja" | "body_ko" | "body_ja" | "pinned" | "is_published"> & { id?: string };

const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST=JST

export default function NoticeForm({ initial, onDone }: { initial: Draft; onDone?: () => void }) {
  const [v, setV] = useState<Draft>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [isPending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setV((p) => ({ ...p, [k]: val }));

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!v.title_ko.trim() || !v.title_ja.trim()) { setError("제목은 한국어·일본어 둘 다 적어 주세요."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.published_on)) { setError("게시일을 골라 주세요."); return; }
    setBusy(true);
    const supabase = createBrowserSupabase();
    const row = {
      published_on: v.published_on, title_ko: v.title_ko.trim(), title_ja: v.title_ja.trim(),
      body_ko: v.body_ko.trim(), body_ja: v.body_ja.trim(), pinned: v.pinned, is_published: v.is_published,
    };
    const { error: err } = v.id
      ? await supabase.from("notices").update(row).eq("id", v.id)
      : await supabase.from("notices").insert(row);
    setBusy(false);
    if (err) { setError(err.message); return; }
    onDone?.();
    start(() => router.refresh());
  }

  const input = "w-full rounded-full bg-tomo-ivory px-3 py-2 text-sm";
  const area = "w-full rounded-md bg-tomo-ivory px-3 py-2 text-sm";
  const label = "text-[12px] font-bold text-ink-soft";
  return (
    <form onSubmit={save} className="card flex flex-col gap-2 p-3.5">
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>제목 (한국어)
          <input value={v.title_ko} onChange={(e) => set("title_ko", e.target.value)} maxLength={200} className={input} required />
        </label>
        <label className={label}>タイトル (日本語)
          <input value={v.title_ja} onChange={(e) => set("title_ja", e.target.value)} maxLength={200} className={input} required />
        </label>
        <label className={label}>본문 (한국어)
          <textarea value={v.body_ko} onChange={(e) => set("body_ko", e.target.value)} rows={6} maxLength={10000} className={area} />
        </label>
        <label className={label}>本文 (日本語)
          <textarea value={v.body_ja} onChange={(e) => set("body_ja", e.target.value)} rows={6} maxLength={10000} className={area} />
        </label>
        <label className={label}>게시일
          <input type="date" value={v.published_on} onChange={(e) => set("published_on", e.target.value)} className={input} required />
        </label>
        <div className="flex items-end gap-4 pb-2">
          <label className={`flex items-center gap-1.5 ${label}`}>
            <input type="checkbox" checked={v.pinned} onChange={(e) => set("pinned", e.target.checked)} /> 맨 위 고정
          </label>
          <label className={`flex items-center gap-1.5 ${label}`}>
            <input type="checkbox" checked={v.is_published} onChange={(e) => set("is_published", e.target.checked)} /> 게시
          </label>
        </div>
      </div>
      {error && <p role="alert" className="text-[12px] text-tomo-rose">{error}</p>}
      <div className="flex justify-end gap-2">
        {onDone && <button type="button" onClick={onDone} className="press rounded-full px-3 py-1.5 text-[12px] font-bold text-ink-soft">취소</button>}
        <button disabled={busy || isPending} className="btn bg-tomo-navy px-4 py-1.5 text-[12px] text-white disabled:opacity-45">{busy ? "저장 중…" : v.id ? "저장" : "추가"}</button>
      </div>
    </form>
  );
}

/** 공지 한 줄 — 보기/수정 토글 + 게시 토글·삭제 */
export function NoticeCard({ notice }: { notice: NoticeRow }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <NoticeForm initial={notice} onDone={() => setEditing(false)} />;
  return (
    <div className={`card flex items-start gap-3 p-3.5 ${notice.is_published ? "" : "opacity-60"}`}>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
          {notice.pinned && <span className="rounded bg-tomo-coral-deep/10 px-1.5 py-0.5 text-[11px] text-tomo-coral-deep">고정</span>}
          {!notice.is_published && <span className="rounded bg-tomo-navy/5 px-1.5 py-0.5 text-[11px] text-ink-soft">비공개</span>}
          <span className="truncate">{notice.title_ko}</span>
        </p>
        <p className="mt-0.5 truncate text-[12px] text-ink-soft"><span className="tnum">{notice.published_on}</span> · {notice.title_ja}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button type="button" onClick={() => setEditing(true)} className="press rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[12px] font-bold text-tomo-navy">수정</button>
        <AdminToggle label={notice.is_published ? "내리기" : "게시"} action={{ table: "notices", id: notice.id, update: { is_published: !notice.is_published } }} />
        <AdminToggle label="삭제" danger confirmText={`'${notice.title_ko}' 공지를 삭제할까요?`} action={{ table: "notices", id: notice.id, del: true }} />
      </div>
    </div>
  );
}

/** + 공지 작성 — 펼치면 빈 폼 */
export function NewNoticeButton() {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn bg-tomo-coral-deep px-3.5 py-1.5 text-[12px] text-white">+ 공지 작성</button>;
  return (
    <div className="w-full">
      <NoticeForm onDone={() => setOpen(false)} initial={{
        published_on: today(), title_ko: "", title_ja: "", body_ko: "", body_ja: "", pinned: false, is_published: true,
      }} />
    </div>
  );
}
