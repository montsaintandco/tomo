"use client";
import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/components/admin/use-auto-refresh";

// 큐 화면 자동 갱신 — 서버 컴포넌트 화면을 주기마다 router.refresh(). 입력 중·상세 창이 열려 있거나 탭이 숨겨지면 건너뛴다
export default function AutoRefresh({ ms = 60_000 }: { ms?: number }) {
  const router = useRouter();
  useAutoRefresh(() => router.refresh(), ms);
  return null;
}
