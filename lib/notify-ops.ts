// 운영 알림 — 텔레그램 봇. env(OPS_TELEGRAM_BOT_TOKEN·OPS_TELEGRAM_CHAT_ID)가 없으면 조용히 건너뛴다(어드민 /admin/errors 에는 남는다).
// 절대 throw 하지 않는다. 보냈으면 true.
export function opsAlertConfigured(): boolean {
  return !!(process.env.OPS_TELEGRAM_BOT_TOKEN && process.env.OPS_TELEGRAM_CHAT_ID);
}

export async function notifyOps(text: string): Promise<boolean> {
  const token = process.env.OPS_TELEGRAM_BOT_TOKEN;
  const chat = process.env.OPS_TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3500), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
