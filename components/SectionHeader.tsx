import Link from "next/link";

export default function SectionHeader({ title, sub, href, linkLabel = "더보기" }: {
  title: string; sub?: string; href?: string; linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[17px] font-extrabold leading-tight text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-[12px] text-ink-soft">{sub}</p>}
      </div>
      {href && (
        <Link href={href} className="press shrink-0 text-[13px] font-bold text-tomo-navy">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}
