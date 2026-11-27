"use client";
import { useState, useSyncExternalStore } from "react";

const KEY = "tomo.admin.opsBanner.dismissed";
const URL = "https://airship.click/admin/sites/tomo";

// tomo 어드민 위쪽 안내 띠(docs/aaa/12 3.1·T4). 평소 운영은 에어쉽 어드민, tomo 어드민은 비상 창구. 닫으면 이 브라우저에서 다시 안 보인다
export default function OpsBanner() {
  // 서버 렌더는 숨김(false) → 브라우저에서 localStorage 를 읽어 보인다(하이드레이션 불일치 없음)
  const stored = useSyncExternalStore(() => () => {}, () => { try { return localStorage.getItem(KEY) !== "1"; } catch { return true; } }, () => false);
  const [closed, setClosed] = useState(false);
  if (!stored || closed) return null;
  return (
    <div role="note" className="mb-4 flex items-start gap-3 rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
      <p className="flex-1">
        평소 운영은 에어쉽 어드민(<a href={URL} target="_blank" rel="noopener noreferrer" className="font-bold underline">airship.click/admin/sites/tomo</a>)에서 합니다. 이 화면은 비상용이에요. 같은 기능을 쓰므로 어느 쪽에서 처리해도 값은 같아요.
      </p>
      <button type="button" aria-label="안내 닫기" onClick={() => { try { localStorage.setItem(KEY, "1"); } catch {} setClosed(true); }}
        className="shrink-0 rounded px-1.5 text-[16px] leading-none text-amber-900 hover:bg-amber-100">×</button>
    </div>
  );
}