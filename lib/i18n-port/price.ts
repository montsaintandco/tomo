// price 트랙 전용 UI 문자열. 형식: "키": ["한국어", "日本語"]. lib/i18n.ts 의 D 에 펼쳐 들어간다.
// 다른 트랙은 이 파일을 고치지 않는다(docs/aaa/05-roadmap.md 2.1).
export const PRICE_I18N = {
  "price.check": ["가격 확인 필요", "価格要確認"],
  "price.shipIncluded": ["배송비 포함", "送料込み"],
  "price.likes": ["찜 {n}", "いいね {n}"],
  "price.currencyNote": ["{cur} 표시", "{cur}表示"],
  "badge.rank": ["{n}위", "{n}位"],
  "badge.new": ["새 상품", "新品"],
} as const satisfies Record<string, readonly [string, string]>;