// 번역 검색이 0건일 때 표현을 바꿔 다시 찾기 (에어쉽·키라팝 search-widen 이식).
// 예: 「韓国産ミニカー」 0건 → 「韓国 ミニカー」 156건.
// 순서: ① 「나라+産/製」을 「나라 + 나머지」로 ② 「나라製/産 + 나머지」로 (나라 이름이 붙어 있으면 띄우기) ③ 앞 낱말을 빼고 뒤 낱말만. 최대 3개.
const COUNTRY = "韓国|日本|中国|台湾|香港|アメリカ|米国|ドイツ|フランス|イタリア|イギリス|英国|スイス|スペイン|タイ|ベトナム|インド|ロシア|北欧";

/** 원래 검색어가 0건일 때 차례로 써 볼 검색어(원래 것은 빼고, 중복 없이). 한국어 검색어는 ③만 해당 */
export function widenCandidates(term: string): string[] {
  const s = term.replace(/[\s\u3000]+/g, " ").trim();
  if (!s) return [];
  const out: string[] = [];
  const m = s.match(new RegExp(`(${COUNTRY})(産|製)の?\\s*`));
  if (m && m.index != null) {
    const rest = (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
    if (rest) {
      out.push(`${m[1]} ${rest}`);
      out.push(`${m[1]}${m[2] === "産" ? "製" : "産"} ${rest}`);
    }
  }
  const g = !m && s.match(new RegExp(`^(${COUNTRY})(\\S+)(.*)$`));
  if (g) out.push(`${g[1]} ${g[2]}${g[3]}`.trim());
  const toks = (out[0] ?? s).split(" ").filter(Boolean);
  if (toks.length >= 2) out.push(toks.slice(1).join(" "));
  return out.filter((x, i) => x && x !== s && out.indexOf(x) === i).slice(0, 3);
}
