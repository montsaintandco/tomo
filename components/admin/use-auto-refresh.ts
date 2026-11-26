"use client";

// 큐 화면 자동 갱신 (AirShip 대시보드 패턴).
// 건너뛰는 경우: 탭이 숨겨짐 / 입력칸에 포커스(편집 중 값이 덮이면 안 된다) / paused(행 선택·작업 중).
// 숨겨졌던 탭으로 돌아오면 주기를 기다리지 않고 바로 한 번 갱신한다.

import { useEffect, useRef } from "react";

function isEditing(): boolean {
  const el = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

/** 지금 갱신해도 되는가 — 테스트·호출부 공용 */
export function canAutoRefresh(paused: boolean): boolean {
  if (paused) return false;
  if (typeof document !== "undefined" && document.hidden) return false;
  if (isEditing()) return false;
  if (typeof document !== "undefined" && document.querySelector('[role="dialog"][aria-modal="true"]')) return false;
  return true;
}

export function useAutoRefresh(fn: () => unknown, ms: number, paused = false) {
  const cb = useRef(fn);
  const pausedRef = useRef(paused);
  useEffect(() => {
    cb.current = fn;
    pausedRef.current = paused;
  });

  useEffect(() => {
    const tick = () => {
      if (canAutoRefresh(pausedRef.current)) void cb.current();
    };
    const t = setInterval(tick, ms);
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= ms) tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ms]);
}
