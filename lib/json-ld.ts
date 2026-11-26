// JSON-LD를 <script>에 넣을 때 쓰는 직렬화. JSON.stringify만 쓰면 사용자 입력(상품 제목 등)의 "</script>"가
// 스크립트를 닫아 저장형 XSS가 된다. <, >, &, U+2028/2029를 유니코드 이스케이프로 바꾼다(JSON 값은 그대로).
export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}