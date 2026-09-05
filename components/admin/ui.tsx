import Link from "next/link";
import { TomoSymbol } from "@/components/Brand";

// 어드민 프리미티브 (서버 컴포넌트) — Linear 문법: 패널·테이블·상태 필·KPI 타일. 한국어 고정

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[18px] font-semibold leading-tight">{title}</h1>
        {sub && <p className="a-muted mt-1 text-[13px]">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className = "", title, count, actions }: {
  children: React.ReactNode; className?: string; title?: string; count?: number; actions?: React.ReactNode;
}) {
  return (
    <section className={`a-panel overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--a-border)] px-3 py-2.5">
          <h2 className="text-[13px] font-semibold">
            {title}{count != null && <span className="a-muted tnum ml-1.5 font-normal">{count}</span>}
          </h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: string }) {
  const rows = Array.isArray(children) ? children.filter(Boolean).length : children ? 1 : 0;
  return (
    <div className="overflow-x-auto">
      <table>
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>
          {rows > 0 ? children : (
            <tr><td colSpan={head.length} className="a-muted py-10 text-center text-[13px]">{empty ?? "데이터가 없어요"}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export type Tone = "gray" | "blue" | "amber" | "green" | "red" | "navy";
export function Pill({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className="a-pill" data-tone={tone}>{children}</span>;
}

export function Kpi({ label, value, sub, href, alert }: { label: string; value: number | string; sub?: string; href?: string; alert?: boolean }) {
  const body = (
    <div className="a-panel p-4 transition-colors hover:bg-[var(--a-hover)]">
      <p className="a-muted text-[12px]">{label}</p>
      <p className={`tnum mt-1 text-[22px] font-semibold leading-none ${alert && Number(value) > 0 ? "text-tomo-coral-deep" : ""}`}>{value}</p>
      {sub && <p className="a-faint mt-1.5 text-[11px]">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function FilterTabs({ base, param, options, current }: {
  base: string; param: string; options: { value: string; label: string; count?: number }[]; current: string;
}) {
  return (
    <nav className="mb-3 flex flex-wrap gap-1" aria-label="필터">
      {options.map((o) => {
        const href = o.value ? `${base}?${param}=${encodeURIComponent(o.value)}` : base;
        const on = current === o.value;
        return (
          <Link key={o.value} href={href} aria-current={on ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${on ? "bg-[var(--a-active)] text-[var(--a-text)]" : "a-muted hover:bg-[var(--a-hover)]"}`}>
            {o.label}{o.count != null && <span className="tnum ml-1 opacity-70">{o.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function Thumb({ src, size = 32 }: { src?: string | null; size?: number }) {
  return (
    <span className="inline-block shrink-0 overflow-hidden rounded-md border border-[var(--a-border)] bg-[var(--a-hover)]" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : <span className="flex h-full w-full items-center justify-center"><TomoSymbol className="h-3 w-5 opacity-60" /></span>}
    </span>
  );
}

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span className="a-round inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--a-active)] text-[11px] font-semibold"
      style={{ width: size, height: size }}>{name.slice(0, 1)}</span>
  );
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const money = (n: number, cur: string) => cur === "JPY" ? `¥${n.toLocaleString("en-US")}` : `${n.toLocaleString("en-US")}원`;
export const todayIso = () => new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

// 상태 메타 — 라벨·톤 한 곳
export const TX_META: Record<string, { label: string; tone: Tone }> = {
  pending_payment: { label: "결제 대기", tone: "gray" }, paid: { label: "결제 완료", tone: "blue" },
  shipped: { label: "발송", tone: "blue" }, shipped_to_center: { label: "센터로 발송", tone: "amber" },
  center_received: { label: "센터 입고", tone: "amber" }, shipped_international: { label: "국제 발송", tone: "blue" },
  delivered: { label: "배송 도착", tone: "blue" }, completed: { label: "완료", tone: "green" },
  cancelled: { label: "취소", tone: "gray" }, disputed: { label: "분쟁", tone: "red" },
};
export const PROXY_META: Record<string, { label: string; tone: Tone; action?: boolean }> = {
  requested: { label: "견적 대기", tone: "red", action: true }, quoted: { label: "고객 승인 대기", tone: "amber" },
  approved: { label: "결제 확인 필요", tone: "red", action: true }, paid: { label: "구매 진행", tone: "red", action: true },
  purchasing: { label: "센터 입고 대기", tone: "red", action: true }, center_received: { label: "국제 발송 대기", tone: "red", action: true },
  shipped_international: { label: "배송중", tone: "blue" }, delivered: { label: "수령 확인 대기", tone: "blue" },
  completed: { label: "완료", tone: "green" }, cancelled: { label: "취소", tone: "gray" },
};
export const ORDER_META: Record<string, { label: string; tone: Tone }> = {
  pending_payment: { label: "결제 대기", tone: "gray" }, paid: { label: "결제 완료", tone: "green" }, cancelled: { label: "취소", tone: "gray" },
};
