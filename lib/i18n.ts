// UI 문자열 사전 — 뷰어 언어(ko/ja) 하나로 화면 전체가 뒤집힌다. 라이브러리 없이 키·치환만.
// ponytail: 페이지가 늘어 키가 200개를 넘기면 네임스페이스 파일로 분할
export type Lang = "ko" | "ja";

const D = {
  "nav.home": ["홈", "ホーム"],
  "nav.global": ["해외직구", "海外購入"],
  "nav.sell": ["판매", "出品"],
  "nav.sellFull": ["판매하기", "出品する"],
  "nav.chat": ["채팅", "チャット"],
  "nav.my": ["마이", "マイ"],
  "nav.mypage": ["마이페이지", "マイページ"],
  "nav.login": ["로그인", "ログイン"],
  "nav.main": ["주요 메뉴", "メインメニュー"],
  "lang.toggle": ["언어·국가", "言語・国"],

  "search.label": ["상품 검색", "商品検索"],
  "search.placeholder": ["어떤 물건을 찾으세요?", "何をお探しですか？"],
  "search.clear": ["검색어 지우기", "検索をクリア"],
  "tab.aria": ["구매 루트", "購入ルート"],
  "tab.all": ["전체", "すべて"],
  "tab.local": ["내 동네", "ご近所"],
  "tab.travel": ["여행 직거래", "旅行で直接取引"],

  "market.KR": ["한국", "韓国"],
  "market.JP": ["일본", "日本"],
  "sources.KR": ["당근마켓·중고나라", "タングン・チュンゴナラ"],
  "sources.JP": ["메루카리·야후옥션", "メルカリ・ヤフオク"],

  "trust.aria": ["토모 안전장치", "トモの安心機能"],
  "trust.escrow": ["에스크로 안전결제", "エスクロー安心決済"],
  "trust.escrowSub": ["받고 확인한 뒤 정산", "受け取り確認後に精算"],
  "trust.center": ["센터 검수 배송", "センター検品配送"],
  "trust.centerSub": ["서울·나리타 센터 경유", "ソウル・成田センター経由"],
  "trust.translate": ["채팅 자동번역", "チャット自動翻訳"],
  "trust.translateSub": ["한국어·일본어 그대로", "韓国語・日本語そのまま"],

  "hub.trending": ["{market}에서 지금 인기", "{market}で今人気"],
  "hub.trendingSub": ["{sources}에서 많이 찾는 것 · 구매대행으로 받아요", "{sources}で人気のもの・購入代行でお届け"],
  "hub.trendingMore": ["{market} 인기 테마 더보기", "{market}の人気テーマをもっと"],
  "hub.own": ["토모에서 바로 거래", "トモで直接取引"],
  "hub.ownSub": ["에스크로로 안전하게, 센터 검수 후 배송", "エスクローで安全に、センター検品後に配送"],
  "hub.ownLink": ["내 동네 상품", "ご近所の商品"],
  "hub.sell": ["{other} 친구들이 {mine}에서 찾는 것", "{other}の友達が{mine}で探しているもの"],
  "hub.sellSub": ["갖고 있다면 {other}에 팔아보세요 — 번역·결제·배송은 토모가 맡아요", "持っていたら{other}に売ってみよう ― 翻訳・決済・配送はトモにおまかせ"],
  "hub.sellCta": ["판매하기", "出品する"],
  "hub.travel": ["{market} 여행 가서 직거래", "{market}旅行で直接取引"],
  "hub.travelSub": ["여행 중 판매자와 직접 만나 받을 수 있어요", "旅行中に出品者と直接会って受け取れます"],
  "hub.more": ["더보기", "もっと見る"],
  "hub.all": ["전체 보기", "すべて見る"],

  "empty.none": ["아직 등록된 상품이 없어요", "まだ出品がありません"],
  "empty.search": ["'{q}' 검색 결과가 없어요", "「{q}」の検索結果がありません"],
  "empty.searchSub": ["다른 검색어로 찾아보거나 해외직구를 둘러보세요", "別のキーワードで探すか、海外購入を見てみましょう"],
  "empty.travel": ["여행 중 직거래할 상품이 아직 없어요", "旅行中に直接取引できる商品はまだありません"],
  "empty.travelSub": ["상대 나라에서 직접 만나 거래할 수 있는 상품이 여기 모여요", "相手の国で直接会って取引できる商品がここに集まります"],
  "empty.sellFirst": ["첫 상품을 등록해 보세요", "最初の商品を出品してみましょう"],
  "empty.globalCta": ["해외직구 둘러보기", "海外購入を見る"],
  "empty.sellCta": ["상품 등록하기", "出品する"],
  "empty.localGuest": ["내 동네 상품은 로그인하고 동네를 설정하면 볼 수 있어요", "ご近所の商品はログインして地域を設定すると表示されます"],
  "empty.localCta": ["로그인하고 동네 설정", "ログインして地域を設定"],

  "feed.error": ["상품을 불러오지 못했어요", "商品を読み込めませんでした"],
  "feed.errorSub": ["잠시 후 다시 시도해 주세요", "しばらくしてからもう一度お試しください"],
  "feed.retry": ["다시 시도", "再試行"],
  "feed.end": ["다 봤어요", "全部見ました"],
  "feed.cap": ["최근 {n}개까지만 보여요", "最新{n}件まで表示しています"],

  "price.approx": ["약", "約"],
  "price.current": ["현재가", "現在価格"],
  "card.travel": ["여행 중 직거래 가능", "旅行中に直接取引OK"],
  "card.safe": ["안전결제", "安心決済"],
  "badge.sold": ["거래완료", "取引完了"],
  "badge.reserved": ["예약중", "予約中"],
  "badge.auction": ["입찰중", "入札中"],
  "badge.soldOut": ["품절", "売り切れ"],

  "time.now": ["방금", "たった今"],
  "time.min": ["{n}분 전", "{n}分前"],
  "time.hour": ["{n}시간 전", "{n}時間前"],
  "time.day": ["{n}일 전", "{n}日前"],
  "time.month": ["{n}달 전", "{n}か月前"],

  "footer.tagline": ["한국과 일본을 잇는 중고거래", "韓国と日本をつなぐフリマ"],
  "footer.thesis": ["두 말풍선이 만나면, 하트가 돼요", "ふたつの吹き出しが出会うと、ハートになる"],
  "footer.desc": ["모든 거래는 에스크로 결제로 보호되고, 국제 거래는 나리타·서울 센터 검수를 거쳐 배송됩니다. 채팅은 한국어·일본어 자동번역으로 이어집니다.", "すべての取引はエスクロー決済で守られ、国際取引は成田・ソウルのセンター検品を経て配送されます。チャットは韓国語・日本語の自動翻訳でつながります。"],
  "footer.company": ["사업자 정보", "事業者情報"],
  "footer.pending": ["준비 중", "準備中"],
  "footer.support": ["고객센터", "カスタマーサポート"],
  "footer.supportLink": ["채팅으로 문의", "チャットで問い合わせ"],
  "footer.legal": ["이용약관 · 개인정보처리방침 — 준비 중", "利用規約・プライバシーポリシー ― 準備中"],
  "footer.trade": ["거래", "取引"],
  "footer.mine": ["내 활동", "マイ活動"],
  "footer.profile": ["내 프로필", "マイプロフィール"],
  "footer.menu": ["푸터 메뉴", "フッターメニュー"],
  "feed.results": ["'{q}' 검색 결과", "「{q}」の検索結果"],
  "feed.localTitle": ["내 동네 물건", "ご近所の商品"],
  "feed.travelTitle": ["여행 중 직거래", "旅行中の直接取引"],
  "feed.latest": ["지금 올라온 물건", "新着の商品"],
  "feed.legend": ["색이 나라를 말해요 — 블루는 한국, 핑크는 일본", "色が国を表します ― ブルーは韓国、ピンクは日本"],
  "skip.main": ["본문 바로가기", "本文へ移動"],
} as const;

export type I18nKey = keyof typeof D;
export const I18N_KEYS = Object.keys(D) as I18nKey[];

export function t(lang: Lang, key: I18nKey, vars?: Record<string, string | number>): string {
  let s: string = D[key][lang === "ja" ? 1 : 0];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export const otherCountry = (c: "KR" | "JP"): "KR" | "JP" => (c === "KR" ? "JP" : "KR");
