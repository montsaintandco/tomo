// 굿즈 용어·IP 이름 일→한 용어집 (키라팝 lib/goods-glossary.ts g9 축약 이식, 순수 함수 — 서버·테스트 공용).
// 번역기는 고유명사를 뜻으로 풀어 버린다(カラフルピーチ→다채로운 복숭아, バラ売り→장미 판매, ハチワレ→꿀벌).
// 그래서 보호→번역→복원 순서로 간다: 용어를 [0] 자리표시로 가리고 번역한 뒤 한국어 용어로 되돌리고, 알려진 오역을 한 번 더 고친다.
// 매칭은 긴 단어 우선. 세 글자 이하 히라가나 용어는 앞뒤가 히라가나가 아닐 때만, 세 글자 이하 가타카나는 앞이 가타카나가 아닐 때만.
// 문맥에 따라 뜻이 갈리는 말(ワンピース·サンダー 등)은 넣지 않았다 — 번역기에 맡긴다.
// 용어를 바꾸면 GLOSSARY_VERSION 을 올린다(상세 번역 캐시 키에 들어간다).

export const GLOSSARY_VERSION = "t7g1";

const ROWS: readonly (readonly [string, string])[] = [
  // 굿즈 말
  ["ちびぬい", "치비 누이"], ["ぬいぐるみキーホルダー", "인형 키링"], ["ぬいぐるみバッジ", "인형 뱃지"], ["ぬいぐるみ", "인형"],
  ["ぬいば", "인형 뱃지"], ["ぬい", "누이"], ["マスコット", "마스코트"], ["アクリルキーホルダー", "아크릴 키링"], ["アクキー", "아크릴 키링"],
  ["キーホルダー", "키링"], ["キーリング", "키링"], ["チャーム", "참"], ["シール", "씰"], ["サイン", "사인"], ["グッズ", "굿즈"], ["パーカー", "후드티"],
  ["デッキ", "덱"], ["スリーブ", "슬리브"], ["パラレル", "패럴렐"], ["シークレット", "시크릿"], ["ラストワン", "라스트원"],
  ["コンプリート", "컴플리트"], ["コンプ", "컴플리트"], ["カートン", "카톤"], ["ノベルティ", "노벨티"], ["エラー", "에러"],
  ["イラスト", "일러스트"], ["パーツ", "파츠"], ["フィギア", "피규어"], ["アクリルスタンド", "아크릴 스탠드"], ["アクスタ", "아크릴 스탠드"],
  ["缶バッジ", "캔뱃지"], ["缶バッチ", "캔뱃지"], ["ブロマイド", "브로마이드"], ["生写真", "생사진"], ["トレーディングカード", "트레이딩 카드"],
  ["トレカ", "트레카"], ["一番くじ", "이치방쿠지"], ["一番クジ", "이치방쿠지"], ["特典", "특전"], ["新品未開封", "새 상품 미개봉"],
  ["新品未使用", "새 상품 미사용"], ["未開封品", "미개봉품"], ["未開封", "미개봉"], ["未使用品", "미사용품"], ["未使用", "미사용"],
  ["まとめ売り", "일괄 판매"], ["バラ売り", "낱개 판매"], ["ばら売り", "낱개 판매"], ["ランダム", "랜덤"], ["痛バッグ", "이타백"], ["痛バ", "이타백"],
  ["受注生産", "주문 생산"], ["再販売", "재판매"], ["再販", "재판매"], ["極美品", "상태 매우 좋음"], ["美品", "상태 좋음"], ["専用", "전용"],
  ["フィギュア", "피규어"], ["ガレージキット", "개러지 키트"], ["ソフビ", "소프비"], ["ねんどろいど", "넨도로이드"], ["サプライズ", "서프라이즈"],
  ["プライズ", "경품"], ["食玩", "식완"], ["ガチャガチャ", "가챠"], ["ガチャ", "가챠"], ["カプセルトイ", "캡슐토이"], ["色紙", "색지"],
  ["ラバーストラップ", "러버 스트랩"], ["ラバスト", "러버 스트랩"], ["クリアファイル", "클리어 파일"], ["コラボレーション", "콜라보레이션"],
  ["コラボカフェ", "콜라보 카페"], ["コラボ", "콜라보"], ["シュリンク付き", "슈링크 포함"], ["シュリンク", "슈링크"], ["ネコポス", "네코포스"],
  // IP·인물 이름
  ["ちいかわ", "치이카와"], ["ハチワレ", "하치와레"], ["なにわ男子", "나니와단시"], ["カラフルピーチ", "컬러풀피치"], ["からぴち", "컬러풀피치"],
  ["ミュウツー", "뮤츠"], ["ピカチュウ", "피카츄"], ["ポケモンカード", "포켓몬 카드"], ["ポケカ", "포켓몬 카드"], ["ポケモン", "포켓몬"],
  ["呪術廻戦", "주술회전"], ["鬼滅の刃", "귀멸의 칼날"], ["進撃の巨人", "진격의 거인"], ["推しの子", "최애의 아이"], ["ブルーロック", "블루록"],
  ["ハイキュー", "하이큐"], ["にじさんじ", "니지산지"], ["ホロライブ", "홀로라이브"], ["サンリオ", "산리오"], ["シナモロール", "시나모롤"],
  ["クロミ", "쿠로미"], ["マイメロディ", "마이멜로디"], ["マイメロ", "마이멜로"], ["ハローキティ", "헬로키티"], ["ポムポムプリン", "폼폼푸린"],
  ["ポチャッコ", "포차코"], ["スヌーピー", "스누피"], ["ジブリ", "지브리"], ["ガンダム", "건담"], ["こびとづかん", "코비토즈칸"],
];
// 번역기가 문맥 안에서 잘 옮기는 말 — 다른 용어가 없으면 가리지 않고 문맥째 번역한다
const SOFT = new Set(["フィギュア", "コラボ", "コラボレーション"]);

const HIRA = /[\u3041-\u309f]/;
const KATA = /[\u30a1-\u30ff]/;
type Entry = { ja: string; ko: string; soft: boolean; edge?: "hira" | "kata" };
const ENTRIES: Entry[] = ROWS.map(([ja, ko]) => ({
  ja, ko, soft: SOFT.has(ja),
  edge: ja.length <= 3 && /^[\u3041-\u309f]+$/.test(ja) ? "hira" as const : ja.length <= 3 && /^[\u30a1-\u30ff]+$/.test(ja) ? "kata" as const : undefined,
})).sort((a, b) => b.ja.length - a.ja.length);

export type GlossarySegment = { text: string; ko?: string; soft?: boolean };

function fits(e: Entry, text: string, at: number, afterTerm: boolean): boolean {
  const prev = afterTerm ? "" : text.charAt(at - 1);
  const next = text.charAt(at + e.ja.length);
  if (e.edge === "hira") return !HIRA.test(prev) && !HIRA.test(next);
  if (e.edge === "kata") return !KATA.test(prev);
  return true;
}

/** 원문을 용어 구간과 나머지 구간으로 나눈다(왼쪽부터, 긴 용어 우선). 이어 붙이면 원문이 된다. */
export function segmentByGlossary(text: string): GlossarySegment[] {
  const segs: GlossarySegment[] = [];
  let plainStart = 0, lastEnd = -1, i = 0;
  while (i < text.length) {
    const hit = ENTRIES.find((e) => text.startsWith(e.ja, i) && fits(e, text, i, i === lastEnd));
    if (!hit) { i++; continue; }
    if (i > plainStart) segs.push({ text: text.slice(plainStart, i) });
    segs.push(hit.soft ? { text: hit.ja, ko: hit.ko, soft: true } : { text: hit.ja, ko: hit.ko });
    i += hit.ja.length;
    plainStart = lastEnd = i;
  }
  if (plainStart < text.length) segs.push({ text: text.slice(plainStart) });
  return segs;
}

const WORD = "0-9A-Za-z\\u00c0-\\u024f\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af";
const WORD_END = new RegExp(`[${WORD}]$`);
const WORD_START = new RegExp(`^[${WORD}]`);

/** 구간을 잇되 글자끼리 바로 붙으면 띄어 쓴다 */
export function joinWords(parts: readonly string[]): string {
  let out = "";
  for (const p of parts) if (p) out += out && WORD_END.test(out) && WORD_START.test(p) ? ` ${p}` : p;
  return out;
}

// 번역 뒤 알려진 오역 — 원문에 그 일본어가 있을 때만 고친다(진짜 「장미 판매」 상품은 그대로)
const FIXES: [when: RegExp, bad: RegExp, good: string][] = [
  [/なにわ\s*男子/, /나니와\s*남자/g, "나니와단시"],
  [/カラフルピーチ|からぴち/, /다채로운\s*복숭아|화려한\s*복숭아/g, "컬러풀피치"],
  [/[バば]ラ売り/, /장미\s*(?:판매|팔기)/g, "낱개 판매"],
  [/ミュウツー/, /뮤투/g, "뮤츠"],
  [/一番[くク]じ/, /이치\s*반\s*쿠지|이치[방반]\s+쿠지/g, "이치방쿠지"],
  [/呪術廻戦/, /마술\s*회전|주술\s+회전/g, "주술회전"],
  [/まとめ売り/, /정리\s*판매/g, "일괄 판매"],
  [/キーホルダー/, /열쇠\s*고리/g, "키링"],
  [/チャーム/, /매력/g, "참"],
  [/ネコポス/, /고양이\s*포스/g, "네코포스"],
];

/** 번역 결과 정리: 폭 없는 공백 제거 + 알려진 오역 교정 + 겹친 공백 정리. ja 는 원문 */
export function fixKoTranslation(ko: string, ja: string): string {
  let out = ko.replace(/[\u200b-\u200d\u2060\ufeff]/g, "");
  for (const [when, bad, good] of FIXES) if (when.test(ja)) out = out.replace(bad, good);
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

const JA = /[\u3040-\u30ff\u3400-\u9fff]/;
const TOKEN = /[[［]\s*(\d{1,3})\s*[\]］]/g;
const PARTICLE = /^(으로|이나|이|가|을|를|은|는|과|와|로|나)(?=$|[^가-힣]|되|된|돼)/;
const PAIRS: Record<string, [string, string]> = {
  이: ["이", "가"], 가: ["이", "가"], 을: ["을", "를"], 를: ["을", "를"], 은: ["은", "는"], 는: ["은", "는"],
  과: ["과", "와"], 와: ["과", "와"], 으로: ["으로", "로"], 로: ["으로", "로"], 이나: ["이나", "나"], 나: ["이나", "나"],
};
// 번역기는 [0]을 숫자 「영」처럼 읽고 조사를 붙인다 — 되돌린 용어의 받침에 맞춰 다시 고른다
function particleFor(term: string, p: string): string {
  const c = term.charCodeAt(term.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return p;
  const final = (c - 0xac00) % 28;
  const [withF, withoutF] = PAIRS[p];
  if (withF === "으로" && final === 8) return "로";
  return final ? withF : withoutF;
}

/** 자리표시([0])를 용어로 되돌린다. 하나라도 사라졌으면 null */
export function restoreTerms(out: string, terms: readonly string[]): string | null {
  const seen: boolean[] = [];
  const re = new RegExp(TOKEN.source, "g");
  let res = "", last = 0, lastTokenEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(out)) !== null) {
    const i = Number(m[1]);
    if (i >= terms.length) continue;
    seen[i] = true;
    res += out.slice(last, m.index);
    res += (m.index === lastTokenEnd || /[가-힣A-Za-z0-9]$/.test(res) ? " " : "") + terms[i];
    last = lastTokenEnd = m.index + m[0].length;
    const p = PARTICLE.exec(out.slice(last));
    if (p) { res += particleFor(terms[i], p[1]); last += p[1].length; }
  }
  res += out.slice(last);
  for (let i = 0; i < terms.length; i++) if (!seen[i]) return null;
  return res;
}

const GLUE = /[0-9A-Za-z\u30a1-\u30ff\u3400-\u9fff]/;

/**
 * 일→한 번역 한 번을 용어집으로 감싼다. translate 는 실패하면 입력을 그대로 돌려주는 규약.
 * 용어 없음 → 그대로 번역+교정 / 번역할 일본어가 용어뿐 → 치환만 / 그 밖 → 보호→번역→복원.
 * 번역기가 자리표시를 망가뜨리면 용어를 한국어로 바꿔 넣은 원문을 한 번 더 번역한다. 번역 실패면 원문.
 */
export async function translateWithGlossary(ja: string, translate: (text: string) => Promise<string>): Promise<string> {
  const fix = (ko: string) => fixKoTranslation(ko, ja);
  const raw = async () => { const out = await translate(ja); return out === ja ? ja : fix(out); };
  const segs = segmentByGlossary(ja);
  if (!segs.some((s) => s.ko !== undefined)) return raw();
  const direct = joinWords(segs.map((s) => s.ko ?? s.text));
  if (!segs.some((s) => s.ko === undefined && JA.test(s.text))) return fix(direct);
  if (!segs.some((s) => s.ko !== undefined && !s.soft)) return raw();
  if (!new RegExp(TOKEN.source).test(ja)) {
    const terms: string[] = [];
    let masked = "";
    segs.forEach((s, i) => {
      if (s.ko === undefined || s.soft) { masked += s.text; return; }
      const next = segs[i + 1]?.text ?? "";
      masked += `${GLUE.test(masked.slice(-1)) ? " " : ""}[${terms.push(s.ko) - 1}]${GLUE.test(next.charAt(0)) ? " " : ""}`;
    });
    const out = await translate(masked);
    if (out === masked) return ja;
    const restored = restoreTerms(out, terms);
    if (restored !== null) return fix(restored);
  }
  const out = await translate(direct);
  return out === direct ? ja : fix(out);
}
