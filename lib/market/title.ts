// 캐시(external_items) 제목 규칙 (05-roadmap T2): 번역 제목은 그 언어가 화면 언어와 같을 때만 넘긴다. 다르면 원문만.
// title_translated_lang 이 비어 있으면(0036 전 행·열 미적용) 글자로 언어를 판정한다.
type Lang = "ko" | "ja";

export function scriptLang(s: string | null | undefined): Lang | null {
  if (!s) return null;
  if (/[ぁ-んァ-ヶ]/.test(s)) return "ja"; // 가나가 있으면 일본어(한자만으로는 판정 안 함)
  if (/[가-힣]/.test(s)) return "ko";
  return null;
}

/** 카드에 넘길 { title(원문), titleTranslated?(화면 언어일 때만) } */
export function titleForLang(title: string, translated: string | null | undefined, translatedLang: string | null | undefined, view: Lang): { title: string; titleTranslated?: string } {
  const tl = translatedLang === "ko" || translatedLang === "ja" ? translatedLang : scriptLang(translated);
  return translated && tl === view && translated !== title ? { title, titleTranslated: translated } : { title };
}
