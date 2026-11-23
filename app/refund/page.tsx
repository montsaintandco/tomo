import LegalDoc from "@/components/LegalDoc";
import { REFUND_KO, REFUND_JA } from "@/lib/refund-policy";
import { pageMeta, langFromSearch } from "@/lib/seo";
import { getRequestLang } from "@/lib/locale";

export async function generateMetadata(props: { searchParams: Promise<{ lang?: string }> }) {
  return pageMeta("/refund", { title: "취소·환불 정책 · キャンセル・返金ポリシー", description: "TOMO 취소·환불 정책 — 결제 취소 가능 시점, 검수 실패·파손·오배송 시 환불 기준, 구매대행 취소 조건과 처리 기간." }, langFromSearch(await props.searchParams));
}

// 취소·환불 정책 — 토스 심사가 상세에서 확인하는 항목(배송 업체·기간, 반품 주소·방법·기한·비용)을 문서로도. 세 거래 유형별로 다르다
const KO = REFUND_KO;
const JA = REFUND_JA;

export default async function RefundPage() {
  const lang = await getRequestLang();
  const ja = lang === "ja";
  return (
    <LegalDoc lang={lang} title={ja ? "キャンセル・返金ポリシー" : "취소·환불 정책"} effective={ja ? "施行日: 2026年9月15日" : "시행일: 2026년 9월 15일"}
      sections={ja ? JA : KO}
      related={[{ href: "/terms", label: ja ? "利用規約" : "이용약관" }, { href: "/privacy", label: ja ? "プライバシーポリシー" : "개인정보처리방침" }]} />
  );
}
