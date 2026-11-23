// 판매 정산·출금 순수 함수 (0026). 잔액 정본은 DB 원장 합 — 여기는 표시·입력 검증·오류 문구 매핑만.
import type { Currency } from "./currency";
import type { I18nKey } from "./i18n";

export type LedgerKind = "sale" | "payout_hold" | "payout_release" | "adjust";
export type PayoutStatus = "requested" | "sent" | "rejected";
export type LedgerRow = { currency: Currency; amount: number; kind: LedgerKind };

export const CURRENCIES: Currency[] = ["KRW", "JPY"];

/** 원장 합 = 잔액 (통화별). DB seller_balances() 와 같은 규칙. */
export function ledgerBalances(rows: Pick<LedgerRow, "currency" | "amount">[]): Record<Currency, number> {
  const out: Record<Currency, number> = { KRW: 0, JPY: 0 };
  for (const r of rows) out[r.currency] += r.amount;
  return out;
}

/** 출금 신청 금액 검증 — 통과면 null, 아니면 i18n 키. */
export function payoutAmountError(amount: number, balance: number): I18nKey | null {
  if (!Number.isInteger(amount) || amount <= 0) return "payout.err.amount";
  if (amount > balance) return "payout.err.balance";
  return null;
}

/** 계좌 입력 정리 + 검증. DB check(숫자·하이픈 4~40자, 이름 1~60자)와 같은 규칙. */
export function normalizeAccount(input: { bank_name: string; account_number: string; account_holder: string }):
  { ok: true; value: { bank_name: string; account_number: string; account_holder: string } } | { ok: false; error: I18nKey } {
  const value = {
    bank_name: input.bank_name.trim(),
    account_number: input.account_number.replace(/\s/g, ""),
    account_holder: input.account_holder.trim(),
  };
  if (!value.bank_name || value.bank_name.length > 60 || !value.account_holder || value.account_holder.length > 60
    || !/^[0-9-]{4,40}$/.test(value.account_number)) return { ok: false, error: "payout.err.accountInvalid" };
  return { ok: true, value };
}

/** DB raise 문구 → 고객용 i18n 키. */
export function payoutErrorKey(message: string | undefined): I18nKey {
  const m = message ?? "";
  if (m.includes("insufficient balance")) return "payout.err.balance";
  if (m.includes("payout already requested")) return "payout.err.pending";
  if (m.includes("no payout account")) return "payout.err.account";
  if (m.includes("invalid amount")) return "payout.err.amount";
  return "payout.err.generic";
}

/** 계좌번호 끝 4자리만 보이기. */
export function maskAccount(num: string): string {
  const digits = num.replace(/\D/g, "");
  return digits.length <= 4 ? digits : `•••• ${digits.slice(-4)}`;
}

/** 원장 금액 부호 표시: +1,000 / −1,000 */
export function signed(amount: number, fmt: (n: number) => string): string {
  return amount < 0 ? `−${fmt(-amount)}` : `+${fmt(amount)}`;
}

export const LEDGER_KIND_KEY: Record<LedgerKind, I18nKey> = {
  sale: "payout.kind.sale", payout_hold: "payout.kind.payout_hold",
  payout_release: "payout.kind.payout_release", adjust: "payout.kind.adjust",
};
export const PAYOUT_STATUS_KEY: Record<PayoutStatus, I18nKey> = {
  requested: "payout.status.requested", sent: "payout.status.sent", rejected: "payout.status.rejected",
};

// 어드민(한국어 고정) 라벨·톤
export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  sale: "판매 적립", payout_hold: "출금 신청", payout_release: "출금 반려 복구", adjust: "수동 조정",
};
export const PAYOUT_META: Record<PayoutStatus, { label: string; tone: "amber" | "green" | "gray" }> = {
  requested: { label: "신청 중", tone: "amber" }, sent: { label: "지급 완료", tone: "green" }, rejected: { label: "반려", tone: "gray" },
};
