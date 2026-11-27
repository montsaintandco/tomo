"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/image-resize";
import { INSPECTION_BUCKET, INSPECTION_MAX_PHOTOS, newPhotoPath, type InspectionKind } from "@/lib/inspection";

// 센터 검수 입력(운영자) — 결과(정상/문제)·메모·사진 → admin_record_inspection(0054). 기록은 추가만(고치기 = 새 기록).
// 사진은 비공개 버킷에 먼저 올리고(운영자만 올릴 수 있음) 경로를 RPC 에 넘긴다. RPC 가 실패하면 방금 올린 사진을 지운다.
// receiveFrom: 지금 상태가 입고 전 단계(거래 shipped_to_center, 대행 purchasing)면 「입고 처리도 같이」를 보여 준다.
export default function InspectionForm({ kind, id, canReceive }: { kind: InspectionKind; id: string; canReceive: boolean }) {
  const [result, setResult] = useState<"ok" | "issue">("ok");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [receive, setReceive] = useState(canReceive);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const working = busy || pending;

  async function save() {
    if (result === "issue" && !note.trim()) return setErr("문제가 있으면 메모를 적어 주세요(구매자·판매자에게 보입니다)");
    if (!confirm(`검수 기록을 남길까요? 결과 ${result === "ok" ? "정상" : "문제"} · 사진 ${files.length}장${receive ? " · 입고 처리 함께" : ""}\n구매자·판매자가 거래 화면에서 이 기록을 봅니다.`)) return;
    setBusy(true); setErr(""); setMsg("");
    const sb = createBrowserSupabase();
    const paths: string[] = [];
    try {
      for (const [i, f] of files.entries()) {
        const path = newPhotoPath(kind, id, i);
        const { error } = await sb.storage.from(INSPECTION_BUCKET).upload(path, await resizeImage(f), { contentType: "image/jpeg", upsert: false });
        if (error) throw new Error(`사진 올리기 실패: ${error.message}`);
        paths.push(path);
      }
      const { error } = await sb.rpc("admin_record_inspection", { p_kind: kind, p_target: id, p_result: result, p_note: note.trim(), p_photos: paths, p_receive: receive });
      if (error) throw new Error(error.message);
      setNote(""); setFiles([]); setResult("ok"); setMsg("저장했어요");
      start(() => router.refresh());
    } catch (e) {
      if (paths.length) await sb.storage.from(INSPECTION_BUCKET).remove(paths).catch(() => {});
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-tomo-navy/10 p-3 text-[13px]">
      <div className="flex gap-3">
        {(["ok", "issue"] as const).map((v) => (
          <label key={v} className="flex items-center gap-1.5">
            <input type="radio" name={`insp-${id}`} checked={result === v} onChange={() => setResult(v)} />
            {v === "ok" ? "정상" : "문제 있음"}
          </label>
        ))}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000}
        placeholder={result === "issue" ? "문제 내용(필수) — 구매자·판매자에게 보입니다" : "메모(선택) — 구매자·판매자에게 보입니다"}
        className="w-full rounded-card bg-white px-3 py-2 text-[13px] shadow-soft" />
      <label className="text-[12px] text-ink-soft">
        사진(최대 {INSPECTION_MAX_PHOTOS}장)
        <input type="file" accept="image/*" multiple className="mt-1 block text-[12px]"
          onChange={(e) => setFiles([...(e.target.files ?? [])].filter((f) => f.type.startsWith("image/")).slice(0, INSPECTION_MAX_PHOTOS))} />
      </label>
      {canReceive && (
        <label className="flex items-center gap-1.5 text-[12px]">
          <input type="checkbox" checked={receive} onChange={(e) => setReceive(e.target.checked)} />
          입고 처리도 같이(구매자·판매자에게 입고 알림)
        </label>
      )}
      <button type="button" disabled={working} onClick={save} className="btn bg-tomo-coral-deep py-2 text-[13px] text-white">
        {working ? "저장 중…" : "검수 기록 저장"}
      </button>
      {msg && <p role="status" className="text-[12px] text-tomo-navy">{msg}</p>}
      {err && <p role="alert" className="text-[12px] text-tomo-rose">{err}</p>}
    </div>
  );
}
