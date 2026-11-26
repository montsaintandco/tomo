// search 트랙 전용 UI 문자열. 형식: "키": ["한국어", "日本語"]. lib/i18n.ts 의 D 에 펼쳐 들어간다.
// 다른 트랙은 이 파일을 고치지 않는다(docs/aaa/05-roadmap.md 2.1).
export const SEARCH_I18N = {
  "search.count": ["상품 {n}개", "{n}件"],
  "search.countMore": ["상품 {n}개 이상", "{n}件以上"],
  "search.chipRemove": ["{label} 조건 지우기", "{label}の条件を外す"],
  "search.chipPriceMin": ["{v} 이상", "{v}以上"],
  "search.chipPriceMax": ["{v} 이하", "{v}以下"],
  "search.translatedChip": ["번역 검색어: {q}", "翻訳キーワード: {q}"],
  "search.translatedChipHint": ["누르면 이 말 그대로 검색해요", "タップするとこの言葉のまま検索します"],
  "search.widened": ["「{from}」은 결과가 없어 「{to}」로 넓혀 찾았어요", "「{from}」は0件だったため「{to}」で検索しました"],
  "search.excluded": ["살 수 없는 출품 {n}개를 뺐어요 (전용·예약·주문제작 등)", "購入できない出品{n}件を除外しました（専用・取り置き・受注など）"],
  "search.excludedShow": ["제외한 출품 보기", "除外した出品を見る"],
  "search.excludedHide": ["제외한 출품 숨기기", "除外した出品を隠す"],
  "search.excludedTitle": ["살 수 없는 출품 (구경만)", "購入できない出品（閲覧のみ）"],
  "search.more": ["더 보기", "もっと見る"],
  "search.moreFail": ["더 불러오지 못했어요. 다시 눌러 주세요", "読み込めませんでした。もう一度タップしてください"],
  "search.recent": ["최근 검색", "最近の検索"],
  "search.recentClear": ["모두 지우기", "すべて削除"],
  "search.recentRemove": ["{q} 지우기", "{q}を削除"],
} as const satisfies Record<string, readonly [string, string]>;