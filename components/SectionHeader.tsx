import Link from "next/link";
import { t, type Lang } from "@/lib/i18n";

export default function SectionHeader({ title, sub, href, linkLabel, level = 2, lang = "ko" }: {
  title: string; sub?: string; href?: string; linkLabel?: string; level?: 2 | 3; lang?: Lang;
}) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <Heading className={`font-extrabold leading-tight text-ink ${level === 3 ? "text-[15px]" : "text-[17px] md:text-xl"}`}>{title}</Heading>
        {sub && <p className="mt-0.5 text-[12px] text-ink-soft md:text-sm">{sub}</p>}
      </div>
      {href && (
        // 시각은 그대로, 히트영역만 44px — 음수 마진으로 패딩 상쇄
        <Link href={href} className="press -my-2 -mr-2 shrink-0 py-2 pr-2 pl-2 text-[13px] font-bold text-tomo-navy">
          {linkLabel ?? t(lang, "hub.more")} →
        </Link>
      )}
    </div>
  );
}
