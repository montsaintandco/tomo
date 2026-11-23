"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import AdminToggle from "@/components/AdminToggle";
import {
  AUDIENCE_LABEL, BANNER_BUCKET, BANNER_SIZE, BANNER_TYPES, bannerImageUrl, bannerState, dayToIso, fileError, fileExt,
  isoToDay, linkError, periodLabel, type Audience, type BannerRow,
} from "@/lib/banners";

// 홈 배너 추가·수정 — RLS·스토리지 정책이 관리자만 통과시킨다 (한국어 고정 운영 화면)
type Draft = {
  id?: string; audience: Audience; image_path: string; alt_ko: string; alt_ja: string; link_url: string;
  start: string; end: string; sort_order: number; is_active: boolean;
};

const toDraft = (b: BannerRow): Draft => ({
  id: b.id, audience: b.audience, image_path: b.image_path, alt_ko: b.alt_ko, alt_ja: b.alt_ja, link_url: b.link_url ?? "",
  start: isoToDay(b.starts_at, "start"), end: isoToDay(b.ends_at, "end"), sort_order: b.sort_order, is_active: b.is_active,
});

export default function BannerForm({ initial, onDone }: { initial: Draft; onDone?: () => void }) {
  const [v, setV] = useState<Draft>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>(initial.image_path ? bannerImageUrl(initial.image_path) : "");
  const [warn, setWarn] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [isPending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setV((p) => ({ ...p, [k]: val }));

  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  function pick(f: File | null) {
    setError(""); setWarn("");
    if (!f) { setFile(null); return; }
    const fe = fileError(f);
    if (fe) { setError(fe); setFile(null); return; }
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      if (Math.abs(w / h / (BANNER_SIZE.w / BANNER_SIZE.h) - 1) > 0.1) setWarn(`지금 이미지는 ${w}×${h}입니다. ${BANNER_SIZE.ratio} 비율이 아니면 홈에서 가장자리가 잘립니다.`);
      else if (w < BANNER_SIZE.w / 2) setWarn(`지금 이미지는 ${w}×${h}입니다. 가로 ${BANNER_SIZE.w / 2}px보다 작으면 흐려 보입니다.`);
    };
    img.src = url;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!v.alt_ko.trim()) { setError("대체텍스트(한국어)를 적어 주세요."); return; }
    const le = linkError(v.link_url);
    if (le) { setError(le); return; }
    if (!v.id && !file) { setError("이미지를 골라 주세요."); return; }
    const starts_at = v.start ? dayToIso(v.start, "start") : null;
    const ends_at = v.end ? dayToIso(v.end, "end") : null;
    if ((v.start && !starts_at) || (v.end && !ends_at)) { setError("날짜 형식이 올바르지 않습니다."); return; }
    if (starts_at && ends_at && ends_at <= starts_at) { setError("종료일은 시작일과 같거나 뒤여야 합니다."); return; }

    setBusy(true);
    const supabase = createBrowserSupabase();
    let image_path = v.image_path;
    let uploaded: string | null = null;
    if (file) {
      uploaded = `${v.audience}/${crypto.randomUUID()}.${fileExt(file.type)}`;
      const up = await supabase.storage.from(BANNER_BUCKET).upload(uploaded, file, { contentType: file.type, upsert: false });
      if (up.error) { setBusy(false); setError(`업로드 실패: ${up.error.message}`); return; }
      image_path = uploaded;
    }
    const row = {
      audience: v.audience, image_path, alt_ko: v.alt_ko.trim(), alt_ja: v.alt_ja.trim(), link_url: v.link_url.trim() || null,
      starts_at, ends_at, sort_order: v.sort_order, is_active: v.is_active,
    };
    const { error: err } = v.id
      ? await supabase.from("banners").update(row).eq("id", v.id)
      : await supabase.from("banners").insert(row);
    if (err) {
      if (uploaded) await supabase.storage.from(BANNER_BUCKET).remove([uploaded]); // 행 저장 실패 → 방금 올린 고아 이미지 정리
      setBusy(false); setError(err.message); return;
    }
    if (uploaded && v.image_path && v.image_path !== uploaded) await supabase.storage.from(BANNER_BUCKET).remove([v.image_path]); // 바꾼 옛 이미지
    setBusy(false);
    onDone?.();
    start(() => router.refresh());
  }

  const input = "w-full rounded-full bg-tomo-ivory px-3 py-2 text-sm";
  const label = "text-[12px] font-bold text-ink-soft";
  return (
    <form onSubmit={save} className="card flex flex-col gap-2 p-3.5">
      <div className="block aspect-[3/1] w-full overflow-hidden rounded-md bg-tomo-navy/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-[12px] text-ink-soft">미리보기 ({BANNER_SIZE.w}×{BANNER_SIZE.h}, {BANNER_SIZE.ratio} 권장)</span>}
      </div>
      <label className={label}>이미지 (JPG·PNG·WEBP, 5MB 이하){v.id && " — 바꿀 때만"}
        <input type="file" accept={BANNER_TYPES.join(",")} onChange={(e) => pick(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[12px]" />
      </label>
      {warn && <p className="text-[12px] text-amber-700">{warn}</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>대상 (뷰어 나라)
          <select value={v.audience} onChange={(e) => set("audience", e.target.value as Audience)} className={input}>
            {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
          </select>
        </label>
        <label className={label}>순서 (작을수록 앞)
          <input type="number" value={v.sort_order} onChange={(e) => set("sort_order", Number(e.target.value) || 0)} className={input} />
        </label>
        <label className={label}>대체텍스트 (한국어, 필수)
          <input value={v.alt_ko} onChange={(e) => set("alt_ko", e.target.value)} maxLength={200} className={input} required />
        </label>
        <label className={label}>代替テキスト (日本語, 비면 한국어)
          <input value={v.alt_ja} onChange={(e) => set("alt_ja", e.target.value)} maxLength={200} className={input} />
        </label>
        <label className={`col-span-2 ${label}`}>링크 (/로 시작하는 사이트 안 주소 또는 https://, 비우면 링크 없음)
          <input value={v.link_url} onChange={(e) => set("link_url", e.target.value)} maxLength={1000} placeholder="/global?q=포켓몬카드" className={input} />
        </label>
        <label className={label}>시작일 (비우면 바로)
          <input type="date" value={v.start} onChange={(e) => set("start", e.target.value)} className={input} />
        </label>
        <label className={label}>종료일 (그날까지, 비우면 상시)
          <input type="date" value={v.end} onChange={(e) => set("end", e.target.value)} className={input} />
        </label>
        <label className={`flex items-center gap-2 ${label}`}>
          <input type="checkbox" checked={v.is_active} onChange={(e) => set("is_active", e.target.checked)} /> 켜기
        </label>
      </div>
      {error && <p role="alert" className="text-[12px] text-tomo-rose">{error}</p>}
      <div className="flex justify-end gap-2">
        {onDone && <button type="button" onClick={onDone} className="press rounded-full px-3 py-1.5 text-[12px] font-bold text-ink-soft">취소</button>}
        <button disabled={busy || isPending} className="btn bg-tomo-navy px-4 py-1.5 text-[12px] text-white disabled:opacity-45">{busy ? "저장 중…" : v.id ? "저장" : "추가"}</button>
      </div>
    </form>
  );
}

const STATE_CLS: Record<string, string> = {
  "노출 중": "bg-green-50 text-green-700", "예약": "bg-amber-50 text-amber-700", "종료": "bg-tomo-navy/5 text-ink-soft", "꺼짐": "bg-tomo-navy/5 text-ink-soft",
};

/** 배너 한 줄 — 보기/수정 토글 + 켜기·끄기/삭제 */
export function BannerCard({ banner }: { banner: BannerRow }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [isPending, start] = useTransition();
  const router = useRouter();
  if (editing) return <BannerForm initial={toDraft(banner)} onDone={() => setEditing(false)} />;
  const state = bannerState(banner);

  async function remove() {
    if (!confirm(`'${banner.alt_ko}' 배너를 삭제할까요? 이미지도 지워집니다.`)) return;
    setBusy(true); setError("");
    const supabase = createBrowserSupabase();
    const { error: err } = await supabase.from("banners").delete().eq("id", banner.id);
    if (err) { setBusy(false); setError(err.message); return; }
    await supabase.storage.from(BANNER_BUCKET).remove([banner.image_path]); // 실패해도 행은 이미 지워짐 — 고아 파일만 남는다
    setBusy(false);
    start(() => router.refresh());
  }

  return (
    <div className={`card flex items-center gap-3 p-3 ${state === "노출 중" ? "" : "opacity-70"}`}>
      <span className="tnum w-8 shrink-0 text-center text-[12px] font-bold text-ink-soft">{banner.sort_order}</span>
      <span className="block aspect-[3/1] w-[132px] shrink-0 overflow-hidden rounded-md bg-tomo-navy/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bannerImageUrl(banner.image_path)} alt="" loading="lazy" className="h-full w-full object-cover" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{banner.alt_ko}{banner.alt_ja && <span className="font-normal text-ink-soft"> · {banner.alt_ja}</span>}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-soft">
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${STATE_CLS[state]}`}>{state}</span>
          <span>{AUDIENCE_LABEL[banner.audience]}</span>
          <span>{periodLabel(banner)}</span>
          <span className="truncate">{banner.link_url ?? "링크 없음"}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button type="button" onClick={() => setEditing(true)} className="press rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[12px] font-bold text-tomo-navy">수정</button>
        <AdminToggle label={banner.is_active ? "끄기" : "켜기"} action={{ table: "banners", id: banner.id, update: { is_active: !banner.is_active } }} />
        <button type="button" onClick={remove} disabled={busy || isPending} className="press rounded-full bg-tomo-coral-deep/10 px-3 py-1.5 text-[12px] font-bold text-tomo-coral-deep disabled:opacity-45">삭제</button>
        {error && <span role="alert" className="text-[11px] text-tomo-rose">{error}</span>}
      </div>
    </div>
  );
}

/** + 배너 추가 — 펼치면 빈 폼 */
export function NewBannerButton({ nextOrder }: { nextOrder: number }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn bg-tomo-coral-deep px-3.5 py-1.5 text-[12px] text-white">+ 배너 추가</button>;
  return (
    <div className="w-full">
      <BannerForm onDone={() => setOpen(false)} initial={{
        audience: "ALL", image_path: "", alt_ko: "", alt_ja: "", link_url: "", start: "", end: "", sort_order: nextOrder, is_active: true,
      }} />
    </div>
  );
}
