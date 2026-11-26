// home 트랙 전용 UI 문자열. 형식: "키": ["한국어", "日本語"]. lib/i18n.ts 의 D 에 펼쳐 들어간다.
// 다른 트랙은 이 파일을 고치지 않는다(docs/aaa/05-roadmap.md 2.1).
export const HOME_I18N = {
  "home.recent": ["최근 본 상품", "最近見た商品"],
  "home.recentClear": ["지우기", "クリア"],
  "home.catAria": ["카테고리 — {market} 마켓에서 찾기", "カテゴリー ― {market}のマーケットで探す"],
  "home.catAll": ["전체 카테고리", "すべて"],
  "home.fallbackTitle": ["그동안 {market}에서 인기", "その間に{market}で人気"],
  "home.fallbackSub": ["토모 상품이 올라오기 전까지 구매대행으로 받아 보세요", "トモの出品が増えるまで、購入代行で取り寄せられます"],
  "home.feedMore": ["더 보기", "もっと見る"],
  "home.localEmpty": ["내 동네에는 아직 상품이 없어요", "ご近所にはまだ出品がありません"],
  "cats.sub": ["누르면 {market} 마켓에서 바로 찾아요. 토모에 올라온 상품이 있으면 함께 보여요.", "タップすると{market}のマーケットで探せます。トモの出品があれば一緒に表示します。"],
  "cats.local": ["토모 상품 {n}개", "トモの出品 {n}件"],
  "cats.etc": ["그 밖의 토모 상품", "その他のトモの出品"],
  "cats.themes": ["지금 인기 키워드", "いま人気のキーワード"],
} as const satisfies Record<string, readonly [string, string]>;
