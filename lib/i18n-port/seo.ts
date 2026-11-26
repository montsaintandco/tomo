// seo 트랙 전용 UI 문자열. 형식: "키": ["한국어", "日本語"]. lib/i18n.ts 의 D 에 펼쳐 들어간다.
// 다른 트랙은 이 파일을 고치지 않는다(docs/aaa/05-roadmap.md 2.1).
export const SEO_I18N = {
  "seo.help.toFaq": ["자주 묻는 질문 {n}개 보기", "よくある質問{n}件を見る"],
} as const satisfies Record<string, readonly [string, string]>;
