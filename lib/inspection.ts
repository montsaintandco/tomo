import type { SupabaseClient } from "@supabase/supabase-js";

// T4 센터 검수 기록(0054). 표 inspections(추가만), 사진은 비공개 버킷 inspection-photos 의 <tx|proxy>/<대상 id>/<파일>.
// 화면은 사진을 서명 URL 로만 보여 준다. 쓰기는 RPC admin_record_inspection 하나(운영자).

export const INSPECTION_BUCKET = "inspection-photos";
export const INSPECTION_MAX_PHOTOS = 10;
export type InspectionKind = "tx" | "proxy";
export type InspectionResult = "ok" | "issue";
export type Inspection = {
  id: string; result: InspectionResult; note: string; photos: string[]; received: boolean; created_at: string;
  inspector: { nickname: string } | null;
  photo_urls: (string | null)[];
};

export const isInspectionKind = (v: unknown): v is InspectionKind => v === "tx" || v === "proxy";

/** 사진 경로 — DB 검사(^kind/id/[A-Za-z0-9._-]{1,80}$)와 같은 규칙 */
export const photoPathOk = (kind: InspectionKind, id: string, path: string) =>
  path.startsWith(`${kind}/${id}/`) && /^[A-Za-z0-9._-]{1,80}$/.test(path.slice(kind.length + id.length + 2));

export const newPhotoPath = (kind: InspectionKind, id: string, i = 0) =>
  `${kind}/${id}/${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 8)}.jpg`;

/**
 * 판매자 센터 발송 안내 — 상자 매칭은 새 코드를 만들지 않고 주문 번호(TX/T)를 주소 끝에 적게 한다(에어쉽 #code6 과 같은 자리).
 * 앞에 「TOMO」를 붙여 같은 창고의 에어쉽 상자(#6자리)와 섞이지 않게 한다.
 */
export const centerMatchTag = (code: string) => `TOMO ${code}`;
export function centerShipLines(addr: { recipient: string; postal: string | null; address: string; phone: string | null }, code: string) {
  return {
    recipient: addr.recipient,
    postal: addr.postal,
    address: `${addr.address} ${centerMatchTag(code)}`,
    phone: addr.phone,
  };
}

/** 대상 하나의 검수 기록(최신 먼저) + 사진 서명 URL. sb 가 사용자 세션이면 RLS(운영자·당사자)로 걸러진다. 조회 실패는 null */
export async function loadInspections(sb: SupabaseClient, kind: InspectionKind, id: string, ttl = 600): Promise<Inspection[] | null> {
  const m = await loadInspectionsMany(sb, kind, [id], ttl);
  return m ? (m.get(id) ?? []) : null;
}

/** 여러 대상을 한 번에(쿼리 1 + 서명 1). 대상 id → 기록(최신 먼저). 서명 실패한 사진은 null(화면은 「사진을 불러오지 못했어요」) */
export async function loadInspectionsMany(sb: SupabaseClient, kind: InspectionKind, ids: string[], ttl = 600): Promise<Map<string, Inspection[]> | null> {
  const out = new Map<string, Inspection[]>();
  if (!ids.length) return out;
  const col = kind === "tx" ? "transaction_id" : "proxy_request_id";
  // 임베드 관계 이름 명시(0051 규칙). 문자열을 그대로 둬야 tests/postgrest-embeds.db.test.ts 가 실호출로 확인한다
  const { data, error } = await sb.from("inspections").select("id, transaction_id, proxy_request_id, result, note, photos, received, created_at, inspector:profiles!inspections_inspector_id_fkey(nickname)")
    .in(col, ids).order("created_at", { ascending: false }).limit(500);
  if (error) return null;
  type Raw = Omit<Inspection, "photo_urls"> & { transaction_id: string | null; proxy_request_id: string | null };
  const rows = (data ?? []) as unknown as Raw[];
  const paths = [...new Set(rows.flatMap((r) => r.photos))];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: s } = await sb.storage.from(INSPECTION_BUCKET).createSignedUrls(paths, ttl);
    for (const x of s ?? []) if (x.path && x.signedUrl) signed.set(x.path, x.signedUrl);
  }
  for (const { transaction_id, proxy_request_id, ...r } of rows) {
    const key = (transaction_id ?? proxy_request_id) as string;
    out.set(key, [...(out.get(key) ?? []), { ...r, photo_urls: r.photos.map((p) => signed.get(p) ?? null) }]);
  }
  return out;
}