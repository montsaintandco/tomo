import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { t, type Lang } from "@/lib/i18n";
import ProfileForm from "@/components/ProfileForm";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "프로필 편집 · プロフィール編集 | TOMO" };

export default async function ProfileEditPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage/edit");
  const lang: Lang = viewer.language;
  const { data: p } = await supabase.from("profiles").select("nickname, country, region, language").eq("id", viewer.id).single();
  if (!p) redirect("/onboarding");

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-xl md:px-6 md:pb-16 md:pt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[17px] font-extrabold leading-tight text-ink md:text-xl">{t(lang, "pf.title")}</h1>
        <Link href="/mypage" className="press text-[13px] font-bold text-tomo-navy">← {t(lang, "nav.mypage")}</Link>
      </div>
      <ProfileForm lang={lang}
        initial={{ nickname: p.nickname, country: p.country as "KR" | "JP", region: p.region, language: p.language as Lang }} />
    </main>
  );
}
