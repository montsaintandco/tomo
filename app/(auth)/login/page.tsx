import { Suspense } from "react";
import { getRequestLang } from "@/lib/locale";
import LoginForm from "@/components/LoginForm";

// 서버에서 뷰어 언어를 정하고 클라이언트 폼에 넘긴다. useSearchParams는 Suspense 경계 안에서만 프리렌더 가능
export default async function LoginPage() {
  const lang = await getRequestLang();
  return <Suspense><LoginForm lang={lang} /></Suspense>;
}
