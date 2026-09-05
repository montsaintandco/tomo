"use client";
import type { TossParams } from "@/lib/toss";

// 토스페이먼츠 결제창 v2 — SDK를 필요할 때만 로드해 requestPayment. 성공/실패는 successUrl/failUrl로 리다이렉트된다
declare global { interface Window { TossPayments?: (clientKey: string) => { payment: (o: { customerKey: string }) => { requestPayment: (o: unknown) => Promise<void> } } } }

function loadSdk(): Promise<void> {
  if (window.TossPayments) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.tosspayments.com/v2/standard";
    s.onload = () => resolve(); s.onerror = () => reject(new Error("toss sdk"));
    document.head.appendChild(s);
  });
}

const EASY_PAY: Record<TossParams["method"], string | undefined> = { card: undefined, kakao_pay: "KAKAOPAY", naver_pay: "NAVERPAY" };

export async function payWithToss(p: TossParams): Promise<void> {
  await loadSdk();
  const payment = window.TossPayments!(p.clientKey).payment({ customerKey: p.customerKey });
  const easyPay = EASY_PAY[p.method];
  // 결제창은 리다이렉트로 끝난다 — 사용자가 창을 닫으면 reject(USER_CANCEL) → 호출부가 버튼을 되살린다
  await payment.requestPayment({
    method: "CARD",
    amount: { currency: "KRW", value: p.amount },
    orderId: p.orderId, orderName: p.orderName,
    successUrl: p.successUrl, failUrl: p.failUrl,
    card: easyPay ? { flowMode: "DIRECT", easyPay } : { flowMode: "DEFAULT", useEscrow: false, useCardPoint: false, useAppCardOnly: false },
  });
}
