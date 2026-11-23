// 홈 배너 — banners 표·공개 버킷 banners (supabase/migrations/0029_content.sql).
// 홈(HomeHub → BannerStrip)이 fetchHomeBanners 로 읽고, 어드민(/admin/banners)이 아래 순수 함수(기간·검증)를 같이 쓴다.
// 쓰기는 관리자 세션이 직접 한다(RLS 가 관리자만 통과). 서버·클라이언트·vitest 공용이라 next/* 를 import 하지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { rows } from "./safe";

export const BANNER_BUCKET = "banners";
export const BANNER_MAX_BYTES = 5 * 1024 * 1024; // 버킷 file_size_limit 과 같은 값
export const BANNER_TYPES = ["image/jpeg", "image/png", "image/webp"] as const; // 버킷 allowed_mime_types 와 같다
/** 홈 띠 칸 비율 — 이미지는 칸을 채우고(object-cover) 넘치는 가장자리는 잘린다 */
export const BANNER_SIZE = { w: 1200, h: 400, ratio: "3:1" } as const;
export const BANNER_COLS = "id, audience, image_path, alt_ko, alt_ja, link_url, starts_at, ends_at, sort_order, is_active, created_at, updated_at";

export type Audience = "KR" | "JP" | "ALL";
export const AUDIENCE_LABEL: Record<Audience, string> = { ALL: "전체", KR: "한국 뷰어", JP: "일본 뷰어" };

export interface BannerRow {
  id: string;
  audience: Audience;
  /** banners 버킷 안 경로 (예: KR/3f…c1.webp) */
  image_path: string;
  alt_ko: string;
  alt_ja: string;
  /** 사이트 안 경로("/…") 또는 https:// 주소. null = 눌러도 이동 없음 */
  link_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** 홈에 그릴 값 */
export interface HomeBanner {
  id: string;
  image: string;
  alt: string;
  /** 사이트 안이면 internal=true(next/link), 바깥 https 면 새 탭 */
  link: { href: string; internal: boolean } | null;
}

export function bannerImageUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${BANNER_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** 지금 이 나라 뷰어에게 보이는가 — RLS 와 같은 규칙(켜짐 + starts_at <= 지금 < ends_at) + 대상 */
export const isLive = (b: Pick<BannerRow, "is_active" | "starts_at" | "ends_at">, now: number = Date.now()) =>
  bannerState(b, now) === "노출 중";

/** 홈에 걸 배너만 골라 순서대로 — 관리자 세션으로 홈을 보면 RLS 가 전부 보여 주므로 화면에서도 거른다 */
export function liveBannersFor<T extends Pick<BannerRow, "audience" | "is_active" | "starts_at" | "ends_at" | "sort_order" | "created_at">>(
  list: readonly T[], country: "KR" | "JP", now: number = Date.now(),
): T[] {
  return list
    .filter((b) => (b.audience === "ALL" || b.audience === country) && isLive(b, now))
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

/** 뷰어 언어의 대체텍스트 → 일본어가 비면 한국어 */
export const bannerAlt = (b: Pick<BannerRow, "alt_ko" | "alt_ja">, lang: "ko" | "ja") =>
  lang === "ja" && b.alt_ja.trim() ? b.alt_ja : b.alt_ko;

/**
 * 홈 배너 조회. 표가 없거나(마이그레이션 전)·DB 일시정지·지연(1.5초)이면 빈 배열 → 홈은 지금과 같다.
 */
export async function fetchHomeBanners(supabase: SupabaseClient, country: "KR" | "JP", lang: "ko" | "ja"): Promise<HomeBanner[]> {
  try {
    const now = new Date().toISOString();
    const res = await supabase.from("banners").select(BANNER_COLS)
      .eq("is_active", true).in("audience", [country, "ALL"])
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order("sort_order").order("created_at").limit(10)
      .abortSignal(AbortSignal.timeout(1500));
    return liveBannersFor(rows(res as unknown as { data: BannerRow[] | null; error: { code?: string } | null }), country).map((b) => ({
      id: b.id,
      image: bannerImageUrl(b.image_path),
      alt: bannerAlt(b, lang),
      link: bannerLink(b.link_url),
    }));
  } catch {
    return [];
  }
}

/* ---------- 링크 ---------- */

const SELF = "https://in-site.invalid";
const UNSAFE = /[\s\u0000-\u001f\u007f\\]/; // 공백·제어문자·역슬래시("/\evil.com"은 브라우저가 //evil.com 으로 읽는다)

/** 사이트 안 경로인가 — "/"로 시작하고, 브라우저가 풀어도 다른 호스트로 나가지 않는 주소만 */
export function isSitePath(s: string): boolean {
  if (!s.startsWith("/") || s.startsWith("//") || UNSAFE.test(s)) return false;
  try { return new URL(s, SELF).origin === SELF; } catch { return false; }
}

function isHttpsUrl(s: string): boolean {
  if (UNSAFE.test(s) || s.length > 1000) return false;
  try { const u = new URL(s); return u.protocol === "https:" && !!u.hostname; } catch { return false; }
}

/** 저장된 링크 → 그릴 링크. DB check 가 이미 거르지만 화면에서도 한 번 더 */
export function bannerLink(link: string | null): HomeBanner["link"] {
  if (!link) return null;
  if (isSitePath(link)) return { href: link, internal: true };
  if (isHttpsUrl(link)) return { href: link, internal: false };
  return null;
}

/** 어드민 입력 검사 — 통과하면 null. 빈 값은 「링크 없음」으로 통과 */
export function linkError(raw: string): string | null {
  const link = raw.trim();
  if (!link) return null;
  if (link.length > 1000) return "링크가 너무 깁니다 (1000자 이하).";
  if (link.startsWith("/")) return isSitePath(link) ? null : "쓸 수 없는 주소입니다. 공백·역슬래시 없이 /부터 적어 주세요 (예: /global).";
  if (/^https:\/\//i.test(link)) return isHttpsUrl(link) ? null : "https:// 주소 형식이 올바르지 않습니다.";
  return "링크는 사이트 안 주소(/로 시작) 또는 https:// 주소만 됩니다.";
}

/* ---------- 파일 ---------- */

/** 올리기 전 검사 — 통과하면 null */
export function fileError(file: { type: string; size: number }): string | null {
  if (!(BANNER_TYPES as readonly string[]).includes(file.type)) return "JPG·PNG·WEBP 이미지만 올릴 수 있습니다.";
  if (file.size > BANNER_MAX_BYTES) return `5MB 이하만 올릴 수 있습니다 (지금 ${(file.size / 1024 / 1024).toFixed(1)}MB).`;
  return null;
}

export const fileExt = (type: string) => (type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg");

/* ---------- 기간 (KST=JST 하루 단위, 반열림 [시작일 0시, 종료일 다음 날 0시)) ---------- */

const TZ_MS = 9 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** date 입력값 "2026-11-23" → ISO. 시작은 그날 0시, 종료는 다음 날 0시(KST). 비었거나 틀리면 null */
export function dayToIso(day: string, edge: "start" | "end"): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00+09:00`);
  if (Number.isNaN(t)) return null;
  return new Date(edge === "start" ? t : t + DAY_MS).toISOString();
}

/** ISO → date 입력값(KST). 종료는 반열림이라 1ms 앞 날짜로 보여 준다. 비면 "" */
export function isoToDay(iso: string | null, edge: "start" | "end"): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "";
  return new Date(t + TZ_MS - (edge === "end" ? 1 : 0)).toISOString().slice(0, 10);
}

export type BannerState = "노출 중" | "예약" | "종료" | "꺼짐";
export function bannerState(b: Pick<BannerRow, "is_active" | "starts_at" | "ends_at">, now: number = Date.now()): BannerState {
  if (!b.is_active) return "꺼짐";
  if (b.starts_at && now < Date.parse(b.starts_at)) return "예약";
  if (b.ends_at && now >= Date.parse(b.ends_at)) return "종료";
  return "노출 중";
}

/** "26.11.23 ~ 26.11.30" / "26.11.23부터" / "26.11.30까지" / "상시" (KST, 종료일 포함) */
export function periodLabel(b: Pick<BannerRow, "starts_at" | "ends_at">): string {
  const f = (iso: string | null, edge: "start" | "end") => isoToDay(iso, edge).slice(2).replace(/-/g, ".");
  if (!b.starts_at && !b.ends_at) return "상시";
  if (!b.ends_at) return `${f(b.starts_at, "start")}부터`;
  if (!b.starts_at) return `${f(b.ends_at, "end")}까지`;
  return `${f(b.starts_at, "start")} ~ ${f(b.ends_at, "end")}`;
}
