"use client";

// 저장하지 않은 변경이 있을 때 화면 이탈 경고 (키라팝 use-unsaved-guard 이식, 확인창은 브라우저 confirm).
// App Router에는 라우트 blocker가 없어서, 새로고침·탭 닫기는 beforeunload로,
// 사이드바 등 내부 링크 이동은 캡처 단계 클릭 가로채기로 막는다.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useUnsavedGuard(dirty: boolean, message = "저장하지 않은 변경이 있어요. 나갈까요?") {
  const router = useRouter();

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      e.preventDefault();
      e.stopPropagation();
      if (window.confirm(message)) router.push(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message, router]);
}
