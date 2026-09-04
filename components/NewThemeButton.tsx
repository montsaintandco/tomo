"use client";
import { useState } from "react";
import TrendingThemeForm from "@/components/TrendingThemeForm";

export default function NewThemeButton({ country, nextOrder }: { country: "KR" | "JP"; nextOrder: number }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn bg-tomo-coral-deep px-3.5 py-1.5 text-[12px] text-white">+ 테마 추가</button>
    );
  }
  return (
    <div className="w-full">
      <TrendingThemeForm onDone={() => setOpen(false)} initial={{
        country, key: "", label: "", label_ja: "", term: "",
        sources: country === "KR" ? ["mercari", "yahoo_auction"] : ["daangn", "joongna"],
        sort_order: nextOrder, active: true,
      }} />
    </div>
  );
}
