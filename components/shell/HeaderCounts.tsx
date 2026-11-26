"use client";
// 헤더·하단 탭·문의 버튼이 같이 쓰는 「나」 상태(로그인·안읽은 채팅·장바구니·알림).
// 레이아웃은 DB를 기다리지 않는다: 첫 화면은 쿠키 유무로 그리고, 화면이 뜬 뒤 /api/me/summary 를 한 번 부른다.
// 세션 쿠키가 없으면(비로그인) 부르지 않는다. 페이지 이동 때 쿠키가 생기거나 없어지면 다시 맞춘다(로그인·로그아웃).
import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { cookieNames, hasAuthCookie } from "./session";

export type Me = { loggedIn: boolean; unread: number; cart: number; notif: number };

const GUEST: Me = { loggedIn: false, unread: 0, cart: 0, notif: -1 };
const STALE_MS = 60_000; // 숫자는 1분에 한 번까지만 새로 받는다

let me: Me | null = null;
let fetchedAt = 0;
let inflight = false;
let lastCookie: boolean | null = null;
const subs = new Set<() => void>();

function set(next: Me) { me = next; subs.forEach((f) => f()); }
function subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }

async function sync() {
  const has = hasAuthCookie(cookieNames(document.cookie));
  const changed = has !== lastCookie;
  lastCookie = has;
  if (!has) { if (changed || me?.loggedIn) set(GUEST); return; }
  if (inflight || (!changed && Date.now() - fetchedAt < STALE_MS)) return;
  inflight = true;
  try {
    const r = await fetch("/api/me/summary", { cache: "no-store" });
    if (r.ok) { set({ ...GUEST, ...(await r.json()) }); fetchedAt = Date.now(); }
    // 실패(503 등)면 지금 화면을 그대로 둔다 — 로그인한 사람을 게스트로 뒤집지 않는다
  } catch { /* 네트워크 오류: 그대로 */ } finally { inflight = false; }
}

/** initialLoggedIn: 서버가 쿠키 유무로 정한 첫 값(DB 확인 전 추정) */
export function useMe(initialLoggedIn: boolean): Me {
  const path = usePathname();
  const snap = useSyncExternalStore(subscribe, () => me, () => null);
  useEffect(() => { void sync(); }, [path]);
  return snap ?? { ...GUEST, loggedIn: initialLoggedIn };
}
