import Link from "next/link";
import { getRequestLang } from "@/lib/locale";

const C = {
  ko: { msg: "찾으시는 페이지가 없어요", sub: "주소가 바뀌었거나 삭제된 상품일 수 있어요", home: "홈으로", global: "해외직구 보기" },
  ja: { msg: "お探しのページが見つかりません", sub: "URLが変わったか、削除された商品かもしれません", home: "ホームへ", global: "海外購入を見る" },
};

export default async function NotFound() {
  const c = C[await getRequestLang()];
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-brand text-5xl text-tomo-navy">404</p>
      <div>
        <p className="text-sm text-ink">{c.msg}</p>
        <p className="mt-1 text-xs text-ink-soft">{c.sub}</p>
      </div>
      <div className="mt-2 flex gap-2">
        <Link href="/" className="btn bg-tomo-navy px-5 py-2.5 text-sm text-white">{c.home}</Link>
        <Link href="/global" className="btn border border-tomo-navy/15 bg-white px-5 py-2.5 text-sm text-ink">{c.global}</Link>
      </div>
    </main>
  );
}
