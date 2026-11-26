// support-ai 묶음 전용 UI 문자열(지원 봇 AI 답변). 형식: "키": ["한국어", "日本語"]. lib/i18n.ts 의 D 에 펼쳐 들어간다.
export const SUPPORT_AI_I18N = {
  "support.ai.placeholder": ["궁금한 걸 직접 물어보세요", "知りたいことを直接入力してください"],
  "support.ai.send": ["보내기", "送信"],
  "support.ai.thinking": ["답변을 쓰고 있어요…", "回答を作成しています…"],
  "support.ai.badge": ["토미 · AI 답변", "トミ · AI回答"],
  "support.ai.note": ["AI가 사이트 안내를 바탕으로 답해요. 정확하지 않을 수 있어요.", "AIがサイトの案内をもとに回答します。正確でない場合があります。"],
  "support.ai.agentHint": ["이 건은 담당자 확인이 필요해요. '상담원 연결'을 눌러 문의를 남겨 주세요.", "この件は担当者の確認が必要です。「担当者につなぐ」を押してお問い合わせください。"],
  "support.ai.fallback": ["지금은 자동 답변을 할 수 없어요. 아래에서 골라 주시거나 '상담원 연결'을 눌러 주세요.", "現在は自動回答ができません。下から選ぶか「担当者につなぐ」を押してください。"],
} as const satisfies Record<string, readonly [string, string]>;
