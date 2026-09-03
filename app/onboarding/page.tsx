import { getRequestLang } from "@/lib/locale";
import OnboardingForm from "@/components/OnboardingForm";

// 뷰어 언어로 UI를 그리고, 나라 기본값도 언어를 따른다 (일본어 브라우저 → 日本)
export default async function OnboardingPage() {
  const lang = await getRequestLang();
  return <OnboardingForm lang={lang} />;
}
