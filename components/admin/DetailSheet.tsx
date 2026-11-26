"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// 상세 시트 — 오른쪽에서 열리는 창. 열림 여부는 URL(?open=<id>)이 정한다: 새로고침·링크 공유에도 그대로 열린다.
// 네이티브 <dialog>.showModal() 이라 포커스 가두기·Esc 닫기가 기본으로 된다. 닫으면 closeHref 로 주소를 바꾼다.
export default function DetailSheet({ title, sub, closeHref, children }: {
  title: React.ReactNode; sub?: React.ReactNode; closeHref: string; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const close = () => router.replace(closeHref, { scroll: false });

  return (
    <dialog ref={ref} aria-modal="true" aria-labelledby="detail-sheet-title"
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-[560px] overflow-hidden border-l border-[var(--a-border)] bg-white p-0 text-[13px] text-[var(--a-text)] backdrop:bg-black/20">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--a-border)] px-4 py-3">
          <div className="min-w-0">
            <h2 id="detail-sheet-title" className="text-[15px] font-semibold leading-tight">{title}</h2>
            {sub && <div className="a-muted mt-1 text-[12px]">{sub}</div>}
          </div>
          <button type="button" onClick={close} aria-label="닫기" className="a-muted rounded-md px-2 py-1 text-[16px] leading-none hover:bg-[var(--a-hover)]">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </dialog>
  );
}
