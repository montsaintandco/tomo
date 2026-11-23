// 사업자 정보 — 전자상거래법 필수 표기 + 토스페이먼츠 심사 항목(하단 상호·대표자·주소·전화, 통신판매업 신고번호).
// 값은 환경변수(Vercel)에서. 사업자등록증과 글자 하나까지 같아야 심사를 통과한다. 비어 있으면 "준비 중"으로 보이고 complete=false
const v = (k: string) => (process.env[k] ?? "").trim() || null;

export const company = {
  name: v("NEXT_PUBLIC_COMPANY_NAME"),           // 상호 (예: 주식회사 토모)
  ceo: v("NEXT_PUBLIC_COMPANY_CEO"),             // 대표자명
  bizNo: v("NEXT_PUBLIC_COMPANY_BIZ_NO"),        // 사업자등록번호 000-00-00000
  mailOrderNo: v("NEXT_PUBLIC_COMPANY_MAIL_ORDER_NO"), // 통신판매업 신고번호 (예: 2026-서울강남-0000)
  address: v("NEXT_PUBLIC_COMPANY_ADDRESS"),     // 사업장 주소
  phone: v("NEXT_PUBLIC_COMPANY_PHONE"),         // 고객센터 전화
  email: v("NEXT_PUBLIC_COMPANY_EMAIL"),         // 고객센터 이메일
  hours: v("NEXT_PUBLIC_COMPANY_HOURS"),         // 운영시간 (예: 평일 10:00–18:00, 주말·공휴일 휴무)
  privacyOfficer: v("NEXT_PUBLIC_COMPANY_PRIVACY_OFFICER"), // 개인정보보호책임자 (이름 · 이메일)
  returnAddress: v("NEXT_PUBLIC_COMPANY_RETURN_ADDRESS"),   // 반품(센터) 주소 — 심사 항목
  hosting: "Amazon Web Services Japan G.K.",
};

// Organization JSON-LD 출력 조건 — 전화는 선택(contactPoint에 있으면 포함). 심사용 전화 표기는 푸터 "준비 중"이 따로 알린다
export const companyComplete = !!(company.name && company.ceo && company.bizNo && company.address && company.email);

// 공정위 사업자정보확인 링크 (사업자등록번호 있을 때만)
export const bizLookupUrl = company.bizNo
  ? `https://www.ftc.go.kr/bizCommPop.do?wrkr_no=${company.bizNo.replace(/-/g, "")}`
  : null;

// 약관·정책 문구의 {company}·{phone} 등을 사업자 정보로 채운다. 비어 있으면 「준비 중」 — LegalDoc 화면과 AI 상담이 같이 쓴다
export function fillCompany(s: string, lang: "ko" | "ja"): string {
  const na = lang === "ja" ? "準備中" : "준비 중";
  return s
    .replaceAll("{company}", company.name ?? (lang === "ja" ? "TOMO運営会社" : "TOMO 운영사"))
    .replaceAll("{ceo}", company.ceo ?? na).replaceAll("{address}", company.address ?? na)
    .replaceAll("{phone}", company.phone ?? na).replaceAll("{email}", company.email ?? na)
    .replaceAll("{hours}", company.hours ?? na).replaceAll("{officer}", company.privacyOfficer ?? company.email ?? na)
    .replaceAll("{returnAddress}", company.returnAddress ?? na).replaceAll("{bizNo}", company.bizNo ?? na)
    .replaceAll("{mailOrderNo}", company.mailOrderNo ?? na);
}
