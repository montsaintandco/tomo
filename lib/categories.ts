// 토모 카테고리 체계 (2026-11-26) — 에어쉽 대분류(src/lib/categories.ts)를 토모에 맞게 옮기고, 세부 분류는 메루카리 실제 카테고리 번호로 묶었다.
// 단일 소스: /categories, /categories/<slug>, 검색(/global?cat=), 홈 원형 카테고리, 판매 폼이 전부 여기를 본다.
//
// 누가 무엇을 보나
// - 한국 사용자 → 일본 마켓. 메루카리는 categoryId 필터로 찾는다(키워드 대체 아님). 번호는 api.mercari.jp/master/v2/datasets/item_categories
//   2026-11-26 실측(tests/unit/fixtures/mercari-categories.json, 0~3단계). mq 가 있으면 그 카테고리 안에서 그 말로 좁힌다(캐릭터 이름처럼 메루카리에 카테고리가 없는 것).
//   야후 플리마는 카테고리 번호를 쓰지 않는다(체계가 다르다). 탭을 직접 골랐을 때만 일본어 이름(mq ?? ja)으로 찾는다.
// - 일본 사용자 → 한국 마켓(당근·중고나라). 두 곳 다 검색 API 에 카테고리 번호가 없다. 그래서 한국어 키워드(kr, 없으면 ko 첫 토막)로 대신 찾는다.
//   ponytail: 두 사이트 카테고리 API 가 확인되면 번호로 승격.
//
// slug 는 URL 과 판매 매물 listings.category 값이다. 예전 값(figure·camera·kpop·game·vintage)은 같은 slug 의 대분류로 이어진다.
// fashion 은 여성·남성으로 나뉘어 대분류가 아니지만, 예전 매물이 있을 수 있어 판매 값으로는 계속 받는다(LEGACY_LISTING).

export type Lang = "ko" | "ja";

export interface SubCategory {
  slug: string;
  ko: string;
  ja: string;
  /** 메루카리 categoryId (여러 개면 OR) */
  mercari: number[];
  /** 메루카리 카테고리 안에서 쓸 일본어 검색어 (선택) */
  mq?: string;
  /** 한국 마켓 검색어. 없으면 ko 의 「·」 앞 토막 */
  kr?: string;
}

export interface MajorCategory extends SubCategory {
  /** 이 대분류와 가까운 메루카리 대분류(위치 표시·트리 강조) */
  roots: number[];
  /** public/hero/<hero>.jpg 대표 사진 (있을 때만) */
  hero?: string;
  subs: SubCategory[];
}

const s = (slug: string, ko: string, ja: string, mercari: number[], extra: Pick<SubCategory, "mq" | "kr"> = {}): SubCategory =>
  ({ slug, ko, ja, mercari, ...extra });

export const CATEGORIES: MajorCategory[] = [
  {
    slug: "figure", ko: "피규어·취미", ja: "フィギュア・ホビー", kr: "피규어", hero: "figure",
    mercari: [81, 743, 82, 83, 7579, 8863, 7378], roots: [1328, 6386],
    subs: [
      s("figure", "피규어", "フィギュア", [81]),
      s("plamo", "프라모델·모형", "プラモデル・模型", [743], { kr: "프라모델" }),
      s("trading-card", "트레이딩 카드", "トレーディングカード", [82], { kr: "트레이딩카드" }),
      s("toy", "장난감", "おもちゃ", [83]),
      s("gacha", "가챠·캡슐토이", "ガチャ・カプセルトイ", [7380], { kr: "가챠" }),
      s("kuji", "이치방쿠지", "一番くじ", [1328], { mq: "一番くじ" }),
      s("doll", "인형·돌", "ドール・人形", [8863], { kr: "구체관절인형" }),
      s("boardgame", "보드게임·퍼즐", "ボードゲーム・パズル", [7579]),
      s("rc", "RC·드론", "ラジコン・ドローン", [7378], { kr: "RC카" }),
    ],
  },
  {
    slug: "character", ko: "캐릭터·애니 굿즈", ja: "キャラクター・アニメグッズ", kr: "캐릭터 굿즈", hero: "chiikawa",
    mercari: [745], roots: [1328],
    subs: [
      s("acrylic", "아크릴 스탠드", "アクリルスタンド", [7339], { kr: "아크릴스탠드" }),
      s("keyholder", "키홀더·스트랩", "キーホルダー・ストラップ", [974, 973], { kr: "캐릭터 키링" }),
      s("badge", "캔배지·핀배지", "缶バッジ・ピンズ", [975], { kr: "캔뱃지" }),
      s("plush", "인형·마스코트", "ぬいぐるみ・マスコット", [10869], { kr: "캐릭터 인형" }),
      s("poster", "포스터·태피스트리", "ポスター・タペストリー", [978, 7340], { kr: "애니 포스터" }),
      s("bromide", "카드·브로마이드", "カード・ブロマイド", [10868], { kr: "브로마이드" }),
      s("pokemon", "포켓몬", "ポケモン", [745], { mq: "ポケモン" }),
      s("chiikawa", "치이카와", "ちいかわ", [745], { mq: "ちいかわ" }),
      s("sanrio", "산리오", "サンリオ", [745], { mq: "サンリオ" }),
      s("ghibli", "지브리", "ジブリ", [745], { mq: "ジブリ" }),
    ],
  },
  {
    slug: "kpop", ko: "K-POP·아이돌", ja: "K-POP・アイドル", kr: "아이돌 굿즈",
    mercari: [77], roots: [1328, 9879],
    subs: [
      s("idol", "아이돌 굿즈", "アイドルグッズ", [707]),
      s("photocard", "포토카드", "トレカ", [707], { mq: "トレカ" }),
      s("album", "앨범·CD", "アルバム・CD", [75], { mq: "K-POP", kr: "앨범" }),
      s("musician", "뮤지션 굿즈", "ミュージシャングッズ", [708], { kr: "콘서트 굿즈" }),
      s("vtuber", "버튜버", "Vtuber", [7501]),
      s("stage", "2.5차원·무대", "2.5次元・舞台", [7519, 7538], { kr: "뮤지컬 굿즈" }),
      s("talent", "연예인·선수 굿즈", "タレント・スポーツ選手", [709, 710], { kr: "연예인 굿즈" }),
    ],
  },
  {
    slug: "game", ko: "게임", ja: "ゲーム",
    mercari: [76], roots: [1328, 5],
    subs: [
      s("switch2", "닌텐도 스위치 2", "Nintendo Switch 2", [7013], { kr: "스위치2" }),
      s("switch", "닌텐도 스위치", "Nintendo Switch", [7002], { kr: "닌텐도 스위치" }),
      s("ps5", "PS5", "PS5", [6983]),
      s("ps4", "PS4", "PS4", [6987]),
      s("ds", "닌텐도 3DS·DS", "ニンテンドー3DS・DS", [7021, 7049], { kr: "닌텐도 3DS" }),
      s("xbox", "Xbox", "Xbox", [7122, 7053], { kr: "엑스박스" }),
      s("retro", "레트로·그 밖의 기종", "レトロ・その他機種", [7135, 7090, 7057, 7075, 7103, 7107, 706], { kr: "레트로 게임" }),
      s("guide", "공략본", "攻略本", [10112], { kr: "공략집" }),
    ],
  },
  {
    slug: "camera", ko: "카메라", ja: "カメラ",
    mercari: [97], roots: [3888],
    subs: [
      s("digital", "디지털카메라", "デジタルカメラ", [843]),
      s("film", "필름카메라", "フィルムカメラ", [844]),
      s("lens", "렌즈", "レンズ", [1255, 846], { kr: "카메라 렌즈" }),
      s("video", "캠코더·액션캠", "ビデオ・アクションカメラ", [845, 4021], { kr: "캠코더" }),
      s("instant", "즉석카메라", "インスタントカメラ", [4027], { kr: "폴라로이드" }),
      s("accessory", "카메라 용품", "カメラアクセサリー", [4096, 4074, 4081], { kr: "카메라 악세사리" }),
      s("film-roll", "필름", "フィルム", [4039], { kr: "카메라 필름" }),
    ],
  },
  {
    slug: "digital", ko: "디지털·가전", ja: "デジタル・家電", kr: "전자기기",
    mercari: [7, 99, 101], roots: [7, 3888, 4136],
    subs: [
      s("phone", "스마트폰", "スマートフォン", [100]),
      s("tablet", "태블릿", "タブレット", [968]),
      s("pc", "노트북·PC", "ノートPC・パソコン", [840, 839, 10712], { kr: "노트북" }),
      s("pc-parts", "PC 주변기기·부품", "PC周辺機器・パーツ", [841, 1156], { kr: "PC 부품" }),
      s("earphone", "이어폰·헤드폰", "イヤホン・ヘッドホン", [854, 1210], { kr: "이어폰" }),
      s("audio", "오디오", "オーディオ機器", [99]),
      s("smartwatch", "스마트워치", "スマートウォッチ", [3675]),
      s("appliance", "생활가전", "生活家電", [101]),
    ],
  },
  {
    slug: "women", ko: "여성 의류", ja: "レディース服",
    mercari: [11, 12, 13, 14, 15, 1488, 27, 163, 17, 1326], roots: [3088],
    subs: [
      s("outer", "아우터", "ジャケット・アウター", [12], { kr: "여성 아우터" }),
      s("top", "상의", "トップス", [11], { kr: "여성 상의" }),
      s("pants", "바지", "パンツ", [13], { kr: "여성 바지" }),
      s("skirt", "스커트", "スカート", [14]),
      s("dress", "원피스", "ワンピース", [15]),
      s("setup", "셋업·정장", "セットアップ・フォーマル", [1488, 27], { kr: "여성 정장" }),
      s("inner", "이너·홈웨어", "下着・ルームウェア", [1326, 17], { kr: "여성 잠옷" }),
      s("kimono", "기모노·유카타", "着物・浴衣", [26], { kr: "유카타" }),
    ],
  },
  {
    slug: "men", ko: "남성 의류", ja: "メンズ服",
    mercari: [30, 31, 32, 35, 1785, 42], roots: [3088],
    subs: [
      s("outer", "아우터", "ジャケット・アウター", [31], { kr: "남성 아우터" }),
      s("top", "상의", "トップス", [30], { kr: "남성 상의" }),
      s("pants", "바지", "パンツ", [32], { kr: "남성 바지" }),
      s("suit", "수트", "スーツ", [35], { kr: "남성 정장" }),
      s("inner", "이너·홈웨어", "下着・ルームウェア", [42, 1785], { kr: "남성 잠옷" }),
      s("kimono", "기모노·유카타", "着物・浴衣", [1808], { kr: "남성 유카타" }),
    ],
  },
  {
    slug: "shoes", ko: "신발", ja: "靴",
    mercari: [16, 33, 48], roots: [3088, 3],
    subs: [
      s("sneakers", "스니커즈", "スニーカー", [179, 345]),
      s("boots", "부츠·구두", "ブーツ・革靴", [177, 182, 347], { kr: "부츠" }),
      s("sandals", "샌들", "サンダル", [178, 346]),
      s("pumps", "펌프스", "パンプス", [1495]),
      s("women", "여성 신발 전체", "レディース靴", [16], { kr: "여성 신발" }),
      s("men", "남성 신발 전체", "メンズ靴", [33], { kr: "남성 신발" }),
      s("kids", "아동 신발", "キッズ・ベビーシューズ", [48, 7781]),
    ],
  },
  {
    slug: "bag", ko: "가방·지갑", ja: "バッグ・財布", kr: "가방",
    mercari: [20, 34, 242, 241, 243, 385, 384, 387], roots: [3088],
    subs: [
      s("shoulder", "숄더백", "ショルダーバッグ", [214, 352]),
      s("tote", "토트백", "トートバッグ", [209, 353]),
      s("hand", "핸드백", "ハンドバッグ", [208]),
      s("backpack", "백팩", "リュック", [211, 355]),
      s("pouch", "파우치·클러치", "ポーチ・クラッチ", [216, 215, 1738], { kr: "파우치" }),
      s("travel", "여행가방·캐리어", "旅行バッグ・キャリー", [212, 221, 354, 360], { kr: "캐리어" }),
      s("wallet", "지갑", "財布", [242, 241, 243, 385, 384, 387]),
      s("card-case", "카드·키 케이스", "カード・キーケース", [7435, 245, 7470, 389], { kr: "카드지갑" }),
    ],
  },
  {
    slug: "watch", ko: "시계", ja: "腕時計",
    mercari: [24, 39, 3675], roots: [3088, 7],
    subs: [
      s("women", "여성 시계", "レディース腕時計", [24]),
      s("men", "남성 시계", "メンズ腕時計", [39]),
      s("smartwatch", "스마트워치", "スマートウォッチ", [3675]),
      s("vintage", "빈티지 시계", "ヴィンテージ時計", [24, 39], { mq: "ヴィンテージ" }),
    ],
  },
  {
    slug: "jewelry", ko: "주얼리", ja: "ジュエリー・アクセサリー",
    mercari: [21, 37], roots: [3088],
    subs: [
      s("necklace", "목걸이", "ネックレス", [226, 1559, 376]),
      s("ring", "반지", "リング・指輪", [229, 379]),
      s("earring", "귀걸이", "ピアス・イヤリング", [231, 230, 232, 380, 381, 1768]),
      s("bracelet", "팔찌", "ブレスレット・バングル", [227, 228, 377, 378]),
      s("brooch", "브로치·참", "ブローチ・チャーム", [234, 235], { kr: "브로치" }),
    ],
  },
  {
    slug: "accessory", ko: "패션 소품", ja: "ファッション小物",
    mercari: [23, 38, 19, 36, 22], roots: [3088],
    subs: [
      s("hat", "모자", "帽子", [19, 36]),
      s("eyewear", "선글라스·안경", "サングラス・メガネ", [255, 2127, 401, 2128], { kr: "선글라스" }),
      s("scarf", "머플러·스카프", "マフラー・スカーフ", [250, 252, 251, 395, 396, 397], { kr: "머플러" }),
      s("belt", "벨트·넥타이", "ベルト・ネクタイ", [249, 394, 391], { kr: "벨트" }),
      s("hair", "헤어 액세서리", "ヘアアクセサリー", [22], { kr: "머리핀" }),
      s("keyring", "키링", "キーホルダー・キーリング", [246, 390]),
      s("umbrella", "우산·장갑", "傘・手袋", [260, 247, 409, 392], { kr: "우산" }),
    ],
  },
  {
    slug: "beauty", ko: "뷰티", ja: "コスメ・美容", kr: "화장품",
    mercari: [6], roots: [6],
    subs: [
      s("skincare", "스킨케어", "スキンケア", [1263]),
      s("makeup", "메이크업", "メイクアップ", [1387, 88]),
      s("hair", "헤어케어", "ヘアケア", [90]),
      s("body", "바디케어", "ボディケア", [91]),
      s("nail", "네일", "ネイル", [89]),
      s("fragrance", "향수", "香水", [87]),
      s("device", "뷰티 디바이스", "美容家電", [1237], { kr: "미용기기" }),
    ],
  },
  {
    slug: "sports", ko: "스포츠·레저", ja: "スポーツ・レジャー", kr: "스포츠",
    mercari: [8, 2634, 1139], roots: [8, 2634, 1318],
    subs: [
      s("golf", "골프", "ゴルフ", [1183]),
      s("outdoor", "캠핑·아웃도어", "アウトドア・キャンプ", [1164], { kr: "캠핑" }),
      s("fishing", "낚시", "釣り", [1172]),
      s("bike", "자전거", "自転車", [1139]),
      s("fitness", "피트니스·요가", "トレーニング・ヨガ", [1153], { kr: "운동기구" }),
      s("baseball", "야구", "野球", [884]),
      s("soccer", "축구", "サッカー", [885]),
      s("racket", "테니스·배드민턴", "テニス・バドミントン", [892, 893], { kr: "테니스" }),
      s("winter", "스키·스노보드", "ウィンタースポーツ", [8327], { kr: "스노보드" }),
    ],
  },
  {
    slug: "kids", ko: "유아동·출산", ja: "ベビー・キッズ", kr: "유아용품",
    mercari: [3], roots: [3, 3088],
    subs: [
      s("baby-wear", "아기 옷", "ベビー服", [7732], { kr: "아기옷" }),
      s("kids-wear", "아동복", "キッズ服", [7792]),
      s("toy", "유아 장난감", "ベビー・キッズおもちゃ", [54]),
      s("stroller", "유모차·외출용품", "外出・移動用品", [51], { kr: "유모차" }),
      s("feeding", "수유·이유식", "授乳・食事", [52], { kr: "젖병" }),
      s("maternity", "임부용품", "マタニティ", [7993, 28], { kr: "임부복" }),
      s("school", "등원·학교 용품", "保育園・スクール", [7997], { kr: "책가방" }),
    ],
  },
  {
    slug: "book", ko: "도서·만화", ja: "本・漫画", kr: "책",
    mercari: [5], roots: [5],
    subs: [
      s("manga", "만화", "漫画", [71], { kr: "만화책" }),
      s("manga-set", "만화 전권 세트", "全巻セット", [662], { kr: "만화책 세트" }),
      s("book", "책", "本", [72]),
      s("magazine", "잡지", "雑誌", [73]),
      s("photobook", "사진집", "写真集", [10117], { kr: "화보집" }),
      s("artbook", "일러스트집·아트북", "イラスト集・アート本", [10136, 677], { kr: "아트북" }),
      s("picture-book", "그림책", "絵本・児童書", [965]),
    ],
  },
  {
    slug: "music", ko: "음반·악기", ja: "CD・楽器", kr: "음반",
    mercari: [9879, 79], roots: [9879, 6386],
    subs: [
      s("cd", "CD", "CD", [75], { kr: "음반" }),
      s("vinyl", "LP·레코드", "レコード", [1160], { kr: "LP" }),
      s("dvd", "DVD·블루레이", "DVD・ブルーレイ", [74, 9888], { kr: "블루레이" }),
      s("cassette", "카세트테이프", "カセットテープ", [9882]),
      s("guitar", "기타·베이스", "ギター・ベース", [6387, 718], { kr: "일렉기타" }), // 「기타」만 쓰면 「그 밖의」와 섞인다
      s("keyboard", "건반·전자악기", "鍵盤・デジタル楽器", [721, 6655], { kr: "신디사이저" }),
      s("instrument", "그 밖의 악기", "その他の楽器", [720, 719, 722, 6567, 723], { kr: "악기" }),
      s("dj", "DJ·녹음 장비", "DJ・DTM機材", [725, 726, 724], { kr: "DJ 장비" }),
    ],
  },
  {
    slug: "food", ko: "식품", ja: "食品", kr: "과자",
    mercari: [112, 1398, 1395, 3226], roots: [1844, 3134],
    subs: [
      s("snack", "과자·디저트", "お菓子", [1137], { kr: "과자" }),
      s("tea", "차·커피", "お茶・コーヒー", [1398, 1395], { kr: "커피" }),
      s("seasoning", "조미료·가공식품", "調味料・加工食品", [1138, 1136], { kr: "조미료" }),
      s("supplement", "건강식품", "サプリメント", [3226, 3267], { kr: "영양제" }),
    ],
  },
  {
    slug: "living", ko: "생활·인테리어", ja: "生活・インテリア", kr: "인테리어",
    mercari: [4, 113, 69, 1206, 5597], roots: [4, 113, 69, 1206, 5597],
    subs: [
      s("interior", "인테리어 소품", "インテリア小物", [67]),
      s("light", "조명", "ライト・照明", [65]),
      s("kitchen", "주방·식기", "キッチン・食器", [57], { kr: "식기" }),
      s("bedding", "침구·패브릭", "寝具・ファブリック", [66, 4496], { kr: "침구" }),
      s("stationery", "문구", "文房具", [1151]),
      s("pet", "반려동물 용품", "ペット用品", [69]),
      s("garden", "식물·가드닝", "ガーデニング", [1206], { kr: "화분" }),
      s("diy", "공구·DIY", "DIY・工具", [5597], { kr: "공구" }),
    ],
  },
  {
    slug: "vintage", ko: "빈티지·아트", ja: "ヴィンテージ・アート", kr: "빈티지",
    mercari: [84, 9, 300], roots: [6386, 9, 3088],
    subs: [
      s("antique", "앤티크 소품", "アンティーク雑貨", [1258], { kr: "앤티크" }),
      s("craft", "공예·도자기", "工芸品", [1257], { kr: "도자기" }),
      s("painting", "그림·판화", "絵画・版画", [755, 756], { kr: "그림" }),
      s("collection", "수집품", "コレクション", [114]),
      s("vintage-wear", "빈티지 의류", "古着", [3088], { mq: "古着" }),
      s("handmade", "핸드메이드", "ハンドメイド", [9]),
      s("cosplay", "코스튬·코스프레", "コスプレ", [300], { kr: "코스프레" }),
    ],
  },
];

/**
 * 메루카리 대분류 — 「메루카리 전체 카테고리」 표. 에어쉽 src/lib/market-categories.ts MERCARI_ROOT_CATS 와 같은 번호(2026-11-26 다시 실측).
 * 82(트레이딩 카드)는 대분류가 아니지만 많이 찾는 칸이라 끝에 둔다.
 */
export const MERCARI_ROOTS: { id: number; ko: string; ja: string }[] = [
  { id: 3088, ko: "패션", ja: "ファッション" },
  { id: 3, ko: "베이비·키즈", ja: "ベビー・キッズ" },
  { id: 1328, ko: "게임·장난감·굿즈", ja: "ゲーム・おもちゃ・グッズ" },
  { id: 6386, ko: "하비·악기·아트", ja: "ホビー・楽器・アート" },
  { id: 1027, ko: "티켓", ja: "チケット" },
  { id: 5, ko: "도서·잡지·만화", ja: "本・雑誌・漫画" },
  { id: 9879, ko: "CD·DVD·블루레이", ja: "CD・DVD・ブルーレイ" },
  { id: 7, ko: "스마트폰·태블릿·PC", ja: "スマホ・タブレット・パソコン" },
  { id: 3888, ko: "TV·오디오·카메라", ja: "テレビ・オーディオ・カメラ" },
  { id: 4136, ko: "생활가전·공조", ja: "生活家電・空調" },
  { id: 8, ko: "스포츠", ja: "スポーツ" },
  { id: 2634, ko: "아웃도어·낚시·여행", ja: "アウトドア・釣り・旅行用品" },
  { id: 6, ko: "코스메틱·뷰티", ja: "コスメ・美容" },
  { id: 3134, ko: "다이어트·건강", ja: "ダイエット・健康" },
  { id: 1844, ko: "식품·음료·주류", ja: "食品・飲料・酒" },
  { id: 113, ko: "주방·일용품", ja: "キッチン・日用品・その他" },
  { id: 4, ko: "가구·인테리어", ja: "家具・インテリア" },
  { id: 69, ko: "반려동물용품", ja: "ペット用品" },
  { id: 5597, ko: "DIY·공구", ja: "DIY・工具" },
  { id: 1206, ko: "플라워·가드닝", ja: "フラワー・ガーデニング" },
  { id: 9, ko: "핸드메이드·수예", ja: "ハンドメイド・手芸" },
  { id: 1318, ko: "자동차·오토바이·자전거", ja: "車・バイク・自転車" },
  { id: 82, ko: "트레이딩 카드", ja: "トレーディングカード" },
];

/** 홈 원형 카테고리 — 6칸(+「전체」). 예전 6칸과 가까운 것으로 */
export const FEATURED = ["figure", "character", "kpop", "game", "camera", "vintage"] as const;

export const name = (lang: Lang, c: { ko: string; ja: string }) => (lang === "ja" ? c.ja : c.ko);
export const findMajor = (slug: string | undefined) => CATEGORIES.find((c) => c.slug === slug);
/** 한국 마켓 검색어 — kr 이 없으면 ko 의 「·」 앞 토막 */
export const krTerm = (c: SubCategory) => (c.kr ?? c.ko.split("·")[0]).trim();

// ── 검색 파라미터 (/global?cat=) ──
// 「figure」 = 대분류, 「figure.plamo」 = 세부 분류, 「m1328」 = 메루카리 대분류(표에 있는 번호만). 그 밖은 무시(null).
export type CatRef =
  | { kind: "tomo"; major: MajorCategory; sub?: SubCategory }
  | { kind: "mercari"; root: (typeof MERCARI_ROOTS)[number] };

export function parseCat(raw: unknown): CatRef | null {
  const v = typeof raw === "string" ? raw.trim().slice(0, 60) : "";
  const m = /^m(\d{1,8})$/.exec(v);
  if (m) {
    const root = MERCARI_ROOTS.find((r) => r.id === Number(m[1]));
    return root ? { kind: "mercari", root } : null;
  }
  const [a, b, extra] = v.split(".");
  if (extra !== undefined) return null;
  const major = findMajor(a);
  if (!major) return null;
  if (b === undefined) return { kind: "tomo", major };
  const sub = major.subs.find((x) => x.slug === b);
  return sub ? { kind: "tomo", major, sub } : null;
}

export const catParam = (major: MajorCategory, sub?: SubCategory) => (sub ? `${major.slug}.${sub.slug}` : major.slug);
export const catSearchHref = (major: MajorCategory, sub?: SubCategory) => `/global?cat=${catParam(major, sub)}`;

/** 검색에 넘길 범위 — 메루카리는 번호(+mq), 번호가 없는 마켓은 ja(일본 마켓)·ko(한국 마켓) 검색어 */
export type CatScope = { mercari: number[]; mq?: string; ja: string; ko: string };

export function catScope(ref: CatRef): CatScope {
  if (ref.kind === "mercari") return { mercari: [ref.root.id], ja: ref.root.ja.split("・")[0], ko: ref.root.ko.split("·")[0] };
  const c = ref.sub ?? ref.major;
  return { mercari: c.mercari, ...(c.mq ? { mq: c.mq } : {}), ja: c.mq ?? c.ja.split("・")[0], ko: krTerm(c) };
}

/** 위치 줄 — [전체 카테고리, 대분류, 세부 분류]. href 가 없는 칸은 지금 위치 */
export function catCrumbs(lang: Lang, ref: CatRef, allLabel: string): { label: string; href?: string }[] {
  if (ref.kind === "mercari") return [{ label: allLabel, href: "/categories" }, { label: `${lang === "ja" ? "メルカリ" : "메루카리"} · ${name(lang, ref.root)}` }];
  const out: { label: string; href?: string }[] = [{ label: allLabel, href: "/categories" }, { label: name(lang, ref.major), href: `/categories/${ref.major.slug}` }];
  if (ref.sub) out.push({ label: name(lang, ref.sub) });
  return out;
}

// ── 판매 매물(listings.category) ──
// DB 에는 check 제약이 없다(0001 text not null). 값 검사는 API(app/api/listings)가 이 목록으로 한다.
export const LEGACY_LISTING: Record<string, { ko: string; ja: string }> = {
  fashion: { ko: "패션", ja: "ファッション" }, // 여성·남성 의류로 나뉘기 전 값
};
export const ETC = { ko: "기타", ja: "その他" };
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k); // 「toString」 같은 상속 이름을 막는다
/** 판매 폼에서 고를 수 있는 값(대분류 + etc) */
export const LISTING_CATEGORIES: readonly string[] = [...CATEGORIES.map((c) => c.slug), "etc"];
/** API 가 받는 값 — 새 값 + 예전 값 */
export const isListingCategory = (v: unknown): v is string =>
  typeof v === "string" && (LISTING_CATEGORIES.includes(v) || own(LEGACY_LISTING, v));
export function listingCategoryName(lang: Lang, v: string): string {
  const c = findMajor(v) ?? (own(LEGACY_LISTING, v) ? LEGACY_LISTING[v] : ETC);
  return name(lang, c);
}
