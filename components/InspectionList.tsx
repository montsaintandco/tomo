import { t, type Lang } from "@/lib/i18n";
import { fmtAt } from "@/lib/datetime";
import type { Inspection } from "@/lib/inspection";

// 센터 검수 기록 목록(읽기 전용, 최신 먼저). 고객 화면(거래·대행 상세)과 어드민(센터·분쟁) 공용.
// admin = 검수자·입고 표시까지. 사진은 서명 URL(수명 10분) — 새 창으로 원본을 연다.
export default function InspectionList({ items, lang, admin = false, failed = false }: {
  items: Inspection[]; lang: Lang; admin?: boolean; failed?: boolean;
}) {
  if (failed) return <p className="text-[12px] text-tomo-rose">{t(lang, "insp.loadFail")}</p>;
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((r) => (
        <li key={r.id} className="rounded-card bg-tomo-navy/5 p-3 text-[13px] leading-relaxed text-ink">
          <p className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.result === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-tomo-rose"}`}>
              {t(lang, r.result === "ok" ? "insp.ok" : "insp.issue")}
            </span>
            <span className="tnum text-[12px] text-ink-soft">{fmtAt(r.created_at, lang)}</span>
            {admin && <span className="text-[12px] text-ink-soft">{r.inspector?.nickname ?? "—"}{r.received ? " · 입고 처리 함께" : ""}</span>}
          </p>
          {r.note && <p className="mt-1 whitespace-pre-wrap">{r.note}</p>}
          {r.photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.photo_urls.map((u, i) => u ? (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="block h-16 w-16 overflow-hidden rounded-thumb bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </a>
              ) : (
                <span key={i} className="flex h-16 w-16 items-center justify-center rounded-thumb bg-white p-1 text-center text-[10px] text-ink-faint">{t(lang, "insp.photoFail")}</span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
