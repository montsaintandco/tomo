// 지원 봇 'AI 답변' 공용 정의 — 서버(app/api/support-ai)와 화면(SupportBot)이 같이 본다. 에어쉽 src/lib/support-ai.ts 이식.
// 모델은 Vercel AI Gateway(서버 전용 AI_GATEWAY_API_KEY). 답변 근거는 사이트에 이미 있는 안내 문구뿐이다(support-ai.server).

export const AI_LIMITS = {
  /** 고객 질문 1건 최대 글자 */
  maxChars: 500,
  /** 모델에 보내는 최근 대화 수(질문+답변) */
  maxTurns: 12,
  /** 이전 답변을 되돌려 보낼 때 자르는 길이 */
  maxAnswerChars: 2000,
} as const;

/** 모델이 "사람이 처리해야 하는 건"이라고 판단하면 답 끝에 붙이는 표시 — 화면은 떼고 상담원 연결을 권한다 */
export const AGENT_MARK = "<<AGENT>>";

export type AiTurn = { role: "user" | "assistant"; content: string };

/**
 * AI 가 링크로 걸어도 되는 사이트 내 경로와 설명(설명은 프롬프트에 들어간다).
 * 이 밖의 경로는 화면에서 링크로 그리지 않는다 — 모델이 지어낸 주소로 404 를 보내지 않게.
 */
export const AI_LINKS: Record<string, string> = {
  "/global": "해외 상품 검색·링크 붙여넣기(구매대행 신청)",
  "/cart": "장바구니·주문서(합계 확인)",
  "/guide": "구매대행 안내(비용·절차·FAQ)",
  "/help": "고객센터(자주 묻는 질문)",
  "/refund": "취소·환불 정책",
  "/terms": "이용약관",
  "/sell": "판매 등록",
  "/travel": "여행 직거래",
  "/mypage": "마이페이지",
  "/mypage/orders": "구매 내역(직거래·구매대행 진행 상태)",
  "/mypage/sales": "판매 내역",
  "/mypage/payouts": "판매 정산·출금",
  "/mypage/support": "내 문의(상담원 답변 확인)",
  "/mypage/edit": "프로필 편집(거주 국가 KR/JP)",
  "/mypage/addresses": "배송지 주소록",
};

export type AiSegment = { text: string } | { text: string; to: string };

/** 링크 경로가 허용 목록에 있는지(쿼리·해시는 떼고 본다) */
export function isAllowedAiLink(to: string): boolean {
  const path = to.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return path in AI_LINKS;
}

/** 답변 표시용 정리: 표시(<<AGENT>>)를 떼고, 스트리밍 중 끝에 걸린 반쪽 표시("<<AG")도 숨긴다. 새어 나온 굵게(**)·제목(#)도 벗긴다 */
export function cleanAiText(raw: string): { text: string; agent: boolean } {
  const agent = raw.includes(AGENT_MARK);
  const text = raw
    .split(AGENT_MARK).join("")
    .replace(/<{1,2}[A-Z]{0,5}>?$/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
  return { text, agent };
}

/** 한 줄을 글자/링크 조각으로 — [이름](/경로) 중 허용된 경로만 링크, 나머지는 이름만 글자로 남긴다 */
export function aiSegments(line: string): AiSegment[] {
  const out: AiSegment[] = [];
  const re = /\[([^\]\n]{1,80})\]\(\s*([^)\s]+)\s*\)/g;
  let at = 0;
  for (const m of line.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ text: line.slice(at, i) });
    const to = m[2];
    out.push(to.startsWith("/") && isAllowedAiLink(to) ? { text: m[1], to } : { text: m[1] });
    at = i + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at) });
  return out;
}

/** 요청 본문 검사 — 최근 대화만, 질문으로 끝나야 하고, 길이 제한. 이상하면 null */
export function parseAiTurns(v: unknown): AiTurn[] | null {
  if (!Array.isArray(v)) return null;
  const turns: AiTurn[] = [];
  for (const x of v.slice(-AI_LIMITS.maxTurns)) {
    const role = (x as { role?: unknown })?.role;
    const content = (x as { content?: unknown })?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) return null;
    const limit = role === "user" ? AI_LIMITS.maxChars : AI_LIMITS.maxAnswerChars;
    if (role === "user" && content.length > limit) return null;
    turns.push({ role, content: content.slice(0, limit) });
  }
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") return null;
  return turns;
}

/**
 * AI 상담원 페르소나(2026-11-26 Ren 「ai 상담원 페르소나 주입」) — 화면(말풍선 이름)과 프롬프트(support-ai.server)가 같이 쓴다.
 * 이름 「토미/トミ」: TOMO(友 = 친구)에서 따온 한일을 잇는 친구 같은 상담원. 이름·성격을 바꾸려면 여기만 고친다.
 * 형제 사이트: 에어쉽 「에어리」, 키라팝 「키라」, 도쿄바이 「토키」.
 */
export const PERSONA = {
  name: { ko: "토미", ja: "トミ" },
  mark: "T",
  character: {
    ko: "한국과 일본 양쪽 중고 시장을 잘 아는 친구 같은 상담원. 다정하고 차분하며, 돈·일정·안전결제 얘기는 꼼꼼하고 정확하게 말해요.",
    ja: "日本と韓国の中古市場どちらにも詳しい、友だちのような相談スタッフ。やさしく落ち着いていて、お金・日程・安心決済の話は正確に伝えます。",
  },
} as const;