// 화면에 찍는 날짜·시각은 서버(UTC)·브라우저 시간대가 아니라 한국·일본 시간(UTC+9, 두 나라 같은 시간대)으로 그린다.
// 서버 렌더·클라이언트 컴포넌트 공통. 날짜만(시각 없음) 옵션을 주면 날짜만 나온다.
export const TZ = "Asia/Seoul";

export const fmtAt = (iso: string | Date, lang: "ko" | "ja", o: Intl.DateTimeFormatOptions = {}) =>
  new Date(iso).toLocaleString(lang === "ja" ? "ja-JP" : "ko-KR", { timeZone: TZ, ...o });
