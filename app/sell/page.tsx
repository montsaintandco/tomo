import { getRequestLang } from "@/lib/locale";
import SellForm from "@/components/SellForm";

// 홈 "상대국이 찾는 것" 칩에서 ?hint=로 들어오면 제목을 미리 채운다
export default async function SellPage(props: { searchParams: Promise<{ hint?: string }> }) {
  const { hint } = await props.searchParams;
  const lang = await getRequestLang();
  return <SellForm lang={lang} hint={hint?.slice(0, 80) ?? ""} />;
}
