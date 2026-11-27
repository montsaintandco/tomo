"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { centerShipLines } from "@/lib/inspection";

type Addr = { recipient: string; postal: string | null; address: string; phone: string | null; updated_at: string };

// 판매자 센터 발송 안내에 나가는 센터 주소(0054 center_addresses). 저장 = admin_set_center_address(활동 기록에 전후 값).
// 판매자 화면은 주소 끝에 「TOMO <거래 번호>」를 붙여 보여 준다 — 미리보기로 확인한다.
export default function CenterAddressForm({ center, initial }: { center: "SEOUL" | "NARITA"; initial: Addr | null }) {
  const [v, setV] = useState({ recipient: initial?.recipient ?? "TOMO", postal: initial?.postal ?? "", address: initial?.address ?? "", phone: initial?.phone ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const preview = v.address.trim() ? centerShipLines({ recipient: v.recipient.trim() || "TOMO", postal: v.postal.trim() || null, address: v.address.trim(), phone: v.phone.trim() || null }, "TX000123") : null;

  async function save() {
    if (!v.address.trim()) return setErr("주소를 넣어 주세요");
    if (!confirm("센터 주소를 바꿀까요? 이후 판매자 발송 안내에 바로 나갑니다.")) return;
    setBusy(true); setErr("");
    const { error } = await createBrowserSupabase().rpc("admin_set_center_address", { p_center: center, p_recipient: v.recipient, p_postal: v.postal, p_address: v.address, p_phone: v.phone });
    setBusy(false);
    if (error) return setErr(error.message);
    start(() => router.refresh());
  }
  const field = "h-8 w-full rounded border border-tomo-navy/15 px-2 text-[13px]";
  return (
    <div className="grid max-w-xl gap-2">
      <label>받는 사람<input value={v.recipient} onChange={set("recipient")} maxLength={80} className={field} /></label>
      <label>우편번호<input value={v.postal} onChange={set("postal")} maxLength={20} className={field} /></label>
      <label>주소<input value={v.address} onChange={set("address")} maxLength={300} className={field} /></label>
      <label>전화<input value={v.phone} onChange={set("phone")} maxLength={30} className={field} /></label>
      {preview && <p className="a-muted">판매자에게 보이는 예: {preview.recipient} · {preview.postal ? `${preview.postal} ` : ""}{preview.address}{preview.phone ? ` · ${preview.phone}` : ""}</p>}
      {initial && <p className="a-faint">마지막 변경 {new Date(initial.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>}
      <button type="button" disabled={busy || pending} onClick={save} className="btn h-8 w-fit bg-tomo-navy px-3 text-[12px] text-white">{busy || pending ? "저장 중…" : "주소 저장"}</button>
      {err && <p role="alert" className="text-tomo-rose">{err}</p>}
    </div>
  );
}