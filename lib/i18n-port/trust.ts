// trust 트랙 전용 UI 문자열. 형식: "키": ["한국어", "日本語"]. lib/i18n.ts 의 D 에 펼쳐 들어간다.
// 다른 트랙은 이 파일을 고치지 않는다(docs/aaa/05-roadmap.md 2.1).
export const TRUST_I18N = {
  // 신고
  "trust.report": ["신고", "通報"],
  "trust.report.listing": ["이 상품 신고", "この商品を通報"],
  "trust.report.user": ["이 사용자 신고", "このユーザーを通報"],
  "trust.report.conversation": ["이 대화 신고", "このチャットを通報"],
  "trust.report.title": ["신고 사유를 골라 주세요", "通報の理由を選んでください"],
  "trust.report.sub": ["운영팀이 확인해요. 신고한 사람은 상대에게 알려지지 않아요.", "運営が確認します。通報したことは相手に知らされません。"],
  "trust.reason.spam": ["스팸·광고", "スパム・宣伝"],
  "trust.reason.fraud": ["사기 의심", "詐欺の疑い"],
  "trust.reason.prohibited": ["금지 상품", "禁止されている商品"],
  "trust.reason.abuse": ["욕설·괴롭힘", "暴言・嫌がらせ"],
  "trust.reason.other": ["기타", "その他"],
  "trust.report.detail": ["자세한 내용 (선택)", "詳しい内容（任意）"],
  "trust.report.send": ["신고하기", "通報する"],
  "trust.report.cancel": ["취소", "キャンセル"],
  "trust.report.done": ["신고가 접수됐어요. 운영팀이 확인할게요.", "通報を受け付けました。運営が確認します。"],
  // 차단
  "trust.block": ["차단", "ブロック"],
  "trust.unblock": ["차단 해제", "ブロック解除"],
  "trust.block.confirm": ["차단하면 서로 대화·가격제안을 할 수 없어요. 차단할까요?", "ブロックすると、お互いにチャットや値下げ交渉ができなくなります。ブロックしますか？"],
  "trust.blocked.notice": ["차단 관계라 메시지를 보낼 수 없어요.", "ブロック中のためメッセージを送れません。"],
  "trust.blockedList": ["차단한 사용자", "ブロックしたユーザー"],
  "trust.blockedList.empty": ["차단한 사용자가 없어요.", "ブロックしたユーザーはいません。"],
  // API 오류
  "trust.err.login": ["로그인이 필요해요.", "ログインが必要です。"],
  "trust.err.invalid": ["요청 내용을 확인해 주세요.", "リクエスト内容をご確認ください。"],
  "trust.err.tooMany": ["잠시 후 다시 시도해 주세요.", "しばらくしてからもう一度お試しください。"],
  "trust.err.notFound": ["대상을 찾을 수 없어요.", "対象が見つかりません。"],
  "trust.err.self": ["자기 자신은 신고·차단할 수 없어요.", "自分自身は通報・ブロックできません。"],
  "trust.err.notReady": ["신고·차단 기능을 준비 중이에요.", "通報・ブロック機能は準備中です。"],
  "trust.err.failed": ["처리하지 못했어요. 다시 시도해 주세요.", "処理できませんでした。もう一度お試しください。"],
  "trust.err.blocked": ["차단 관계이거나 이용이 제한돼 보낼 수 없어요.", "ブロック中、または利用が制限されているため送信できません。"],
} as const satisfies Record<string, readonly [string, string]>;
