import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import { formatPrice, type Currency } from "@/lib/currency";
import HeartGauge from "@/components/HeartGauge";
import { CountryChip } from "@/components/Brand";
import LogoutButton from "@/components/LogoutButton";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";
import Link from "next/link";
import { redirect } from "next/navigation";

const TX_LABEL: Record<string, string> = {
  pending_payment: "결제 대기", paid: "결제 완료", shipped: "발송",
  shipped_to_center: "센터로 발송", center_received: "센터 입고",
  shipped_international: "국제 발송", delivered: "배송 도착",
  completed: "완료", cancelled: "취소", disputed: "분쟁",
};
const PROXY_LABEL: Record<string, string> = {
  requested: "신청 접수", quoted: "견적 도착", approved: "승인",
  paid: "결제 완료", purchasing: "현지 구매중", center_received: "센터 입고",
  shipped_international: "국제 발송", delivered: "배송 도착",
  completed: "완료", cancelled: "취소",
};

export default async function MyPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage");

  const [{ data: profile }, { data: buying }, { data: selling }, { data: proxies }] = await Promise.all([
    supabase.from("profiles").select("nickname, country, region, trust_temp").eq("id", viewer.id).single(),
    supabase.from("transactions")
      .select("id, status, item_price, currency, listings(title, source_language, images, listing_translations(language, title))")
      .eq("buyer_id", viewer.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("listings")
      .select("id, title, price, currency, status, images")
      .eq("seller_id", viewer.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("proxy_requests")
      .select("id, status, quote_total, external_items(source, title, title_translated, images)")
      .eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(10),
  ]);

  return (
    <main className="mx-auto max-w-md p-4 pb-24 md:max-w-2xl md:px-6 md:pb-16 md:pt-8">
      <div className="card mb-5 p-4 md:p-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">{profile?.nickname}</p>
            <p className="flex items-center gap-1.5 text-xs text-ink-soft">
              <CountryChip country={(profile?.country ?? "KR") as "KR" | "JP"} />
              {profile?.region}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {viewer.isAdmin && (
              <Link href="/admin" className="btn bg-tomo-navy px-3 py-1.5 text-xs text-white">
                운영자
              </Link>
            )}
            <LogoutButton />
          </div>
        </div>
        <HeartGauge temp={Number(profile?.trust_temp ?? 36.5)} />
      </div>

      <Section title="구매대행" href="/global" hrefLabel="더 둘러보기">
        {(proxies ?? []).map((p) => {
          const it = p.external_items as unknown as { source: string; title: string; title_translated: string | null; images: string[] } | null;
          return (
            <Row key={p.id} href={`/proxy/${p.id}`}
              image={it?.images?.[0]}
              title={it?.title_translated || it?.title || "상품"}
              sub={`${it ? SOURCE_LABEL[it.source as MarketSource] : ""} · ${PROXY_LABEL[p.status] ?? p.status}`}
              right={p.quote_total ? formatPrice(p.quote_total, "JPY") : "견적 대기"} />
          );
        })}
        {(proxies ?? []).length === 0 && <Empty text="대행 신청 내역이 없어요" />}
      </Section>

      <Section title="구매 내역">
        {(buying ?? []).map((t) => {
          const l = t.listings as unknown as {
            title: string; source_language: string; images: string[];
            listing_translations: { language: string; title: string }[];
          } | null;
          return (
            <Row key={t.id} href={`/transactions/${t.id}`}
              image={l?.images?.[0]} title={l ? displayTitle(l, viewer.language) : "상품"}
              sub={TX_LABEL[t.status] ?? t.status}
              right={formatPrice(t.item_price, t.currency as Currency)} />
          );
        })}
        {(buying ?? []).length === 0 && <Empty text="구매 내역이 없어요" />}
      </Section>

      <Section title="판매 상품" href="/sell" hrefLabel="상품 등록">
        {(selling ?? []).map((l) => (
          <Row key={l.id} href={`/listings/${l.id}`}
            image={(l.images as string[])?.[0]} title={l.title}
            sub={l.status === "active" ? "판매중" : l.status === "reserved" ? "예약중" : "판매완료"}
            right={formatPrice(l.price, l.currency as Currency)} />
        ))}
        {(selling ?? []).length === 0 && <Empty text="등록한 상품이 없어요" />}
      </Section>

      <Link href={`/profile/${viewer.id}`}
        className="card block p-3 text-center text-sm font-bold text-tomo-navy">
        내 프로필·후기 보기
      </Link>
    </main>
  );
}

function Section({ title, href, hrefLabel, children }: {
  title: string; href?: string; hrefLabel?: string; children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-ink-soft">{title}</h2>
        {href && <Link href={href} className="text-xs text-tomo-navy">{hrefLabel} →</Link>}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({ href, image, title, sub, right }: {
  href: string; image?: string; title: string; sub: string; right: string;
}) {
  return (
    <Link href={href} className="card flex items-center gap-3 p-3">
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-card bg-tomo-navy/5">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{title}</p>
        <p className="text-xs text-ink-faint">{sub}</p>
      </div>
      <span className="shrink-0 text-sm font-bold text-tomo-navy">{right}</span>
    </Link>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">{text}</p>;
}
