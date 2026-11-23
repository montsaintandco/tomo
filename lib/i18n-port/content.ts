// content 묶음 전용 UI 문자열. 형식: "키": ["한국어", "日本語"]. lib/i18n.ts 의 D 에 펼쳐 들어간다.
export const CONTENT_I18N = {
  "banner.aria": ["이벤트 배너", "イベントバナー"],
  "banner.external": ["새 창에서 열림", "新しいウィンドウで開きます"],
  "notice.pinned": ["고정", "固定"],
} as const satisfies Record<string, readonly [string, string]>;
