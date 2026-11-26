// shell 트랙 전용 UI 문자열. 형식: "키": ["한국어", "日本語"]. lib/i18n.ts 의 D 에 펼쳐 들어간다.
// 다른 트랙은 이 파일을 고치지 않는다(docs/aaa/05-roadmap.md 2.1).
export const SHELL_I18N = {
  "shell.search": ["검색", "検索"],
  "shell.menu": ["메뉴 열기", "メニューを開く"],
  "shell.menuClose": ["메뉴 닫기", "メニューを閉じる"],
  "shell.inapp.label": ["앱 안 브라우저 안내", "アプリ内ブラウザのご案内"],
  "shell.inapp.title": ["{app} 안에서는 로그인이 풀릴 수 있어요.", "{app}の中ではログインが解除されることがあります。"],
  "shell.inapp.bodyIos": ["사파리 같은 기본 브라우저에서 열어 주세요.", "Safariなどの標準ブラウザで開いてください。"],
  "shell.inapp.bodyAndroid": ["크롬 같은 기본 브라우저에서 열어 주세요.", "Chromeなどの標準ブラウザで開いてください。"],
  "shell.inapp.manual": ["화면의 ⋯(더보기) 메뉴에서 「기본 브라우저로 열기」를 누르거나, 주소를 복사해 붙여 넣으면 돼요.", "画面の⋯(その他)メニューから「ブラウザで開く」を押すか、URLをコピーして貼り付けてください。"],
  "shell.inapp.open": ["기본 브라우저로 열기", "ブラウザで開く"],
  "shell.inapp.copy": ["주소 복사", "URLをコピー"],
  "shell.inapp.close": ["닫기", "閉じる"],
  "shell.inapp.copied": ["주소를 복사했어요. 브라우저 주소창에 붙여 넣어 주세요.", "URLをコピーしました。ブラウザのアドレスバーに貼り付けてください。"],
  "shell.inapp.copyFail": ["복사하지 못했어요. 주소를 길게 눌러 복사해 주세요.", "コピーできませんでした。URLを長押ししてコピーしてください。"],
} as const satisfies Record<string, readonly [string, string]>;
