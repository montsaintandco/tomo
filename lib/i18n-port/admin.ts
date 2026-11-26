// admin 트랙 전용 UI 문자열. 형식: "키": ["한국어", "日本語"]. lib/i18n.ts 의 D 에 펼쳐 들어간다.
// 다른 트랙은 이 파일을 고치지 않는다(docs/aaa/05-roadmap.md 2.1).
// 어드민 화면 글은 한국어 고정이고, 여기에는 어드민 API 오류만 둔다(apiError).
export const ADMIN_I18N = {
  "admin.err.adminOnly": ["운영자만 할 수 있어요", "運営者のみ操作できます"],
  "admin.err.invalid": ["잘못된 요청이에요", "不正なリクエストです"],
  "admin.err.notFound": ["상품을 찾지 못했어요", "商品が見つかりません"],
  "admin.err.title": ["제목은 1~80자로 적어 주세요", "タイトルは1〜80文字で入力してください"],
  "admin.err.price": ["가격은 0~100,000,000 사이 정수로 적어 주세요", "価格は0〜100,000,000の整数で入力してください"],
  "admin.err.activeTx": ["진행 중인 거래가 있어 가격을 바꿀 수 없어요", "進行中の取引があるため価格を変更できません"],
  "admin.err.noChange": ["바뀐 내용이 없어요", "変更内容がありません"],
} as const satisfies Record<string, readonly [string, string]>;
