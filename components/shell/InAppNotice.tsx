"use client";
// 앱 안 브라우저 안내 띠 — 로그인 화면(/login)에서 인앱일 때만. 로그인·인증 로직은 건드리지 않고 안내만 한다(03#3, 키라팝 이식).
// 레이아웃에 한 번 두고 경로로 거른다(로그인 페이지 파일은 셸 트랙 소유가 아니라서).
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { detectInApp, externalOpenUrl, IN_APP_NAME, type InAppInfo } from "@/lib/inapp-browser";
import { t, type Lang } from "@/lib/i18n";

const HIDE_KEY = "tomo-inapp-notice-hide";

export default function InAppNotice({ lang }: { lang: Lang }) {
  const path = usePathname();
  const [info, setInfo] = useState<InAppInfo | null>(null);
  const [href, setHref] = useState("");
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  useEffect(() => {
    try { if (sessionStorage.getItem(HIDE_KEY)) return; } catch {}
    // 개발 확인용 ?inapp=1 (운영 빌드에서는 무시)
    const dev = process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).has("inapp")
      ? "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 KAKAOTALK/11.2.0 (INAPP)" : undefined;
    setInfo(detectInApp(dev ?? navigator.userAgent)); // eslint-disable-line react-hooks/set-state-in-effect -- UA 는 브라우저에서만 읽힌다
    setHref(window.location.href);
  }, []);
  if (!info || !path.startsWith("/login")) return null;

  const open = externalOpenUrl(info, href);
  const name = IN_APP_NAME[info.app][lang === "ja" ? 1 : 0];
  const copy = async () => {
    try { await navigator.clipboard.writeText(href); setCopied("ok"); } catch { setCopied("fail"); }
  };
  const hide = () => { try { sessionStorage.setItem(HIDE_KEY, "1"); } catch {} setInfo(null); };
  const btn = "press inline-flex min-h-11 items-center justify-center rounded-full px-4 text-[14px] font-bold";

  return (
    <aside role="note" aria-label={t(lang, "shell.inapp.label")}
      className="mx-auto mt-4 w-[calc(100%-2rem)] max-w-md rounded-card border border-amber-300 bg-amber-50 p-3.5 text-[14px] leading-relaxed text-[#3b2f00]">
      <p className="font-bold">{t(lang, "shell.inapp.title", { app: name })}</p>
      <p className="mt-1">
        {t(lang, info.platform === "ios" ? "shell.inapp.bodyIos" : "shell.inapp.bodyAndroid")}
        {!open && <> {t(lang, "shell.inapp.manual")}</>}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {open && <a href={open} className={`${btn} bg-[#3b2f00] text-white`}>{t(lang, "shell.inapp.open")}</a>}
        <button type="button" onClick={copy} className={`${btn} border border-[#3b2f00]/40 bg-white`}>{t(lang, "shell.inapp.copy")}</button>
        <button type="button" onClick={hide} className={`${btn} text-[#3b2f00]/70 underline underline-offset-2`}>{t(lang, "shell.inapp.close")}</button>
      </div>
      {copied && <p role="status" className="mt-2 text-[13px]">{t(lang, copied === "ok" ? "shell.inapp.copied" : "shell.inapp.copyFail")}</p>}
    </aside>
  );
}