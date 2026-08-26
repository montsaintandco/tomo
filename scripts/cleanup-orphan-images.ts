// listing-images 버킷에서 어떤 리스팅도 참조하지 않는 고아 이미지를 삭제한다.
// 전체 버킷 나열·삭제에는 service_role 키가 필요: SUPABASE_SERVICE_ROLE_KEY (.env.local)
// 실행: npx tsx scripts/cleanup-orphan-images.ts [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (!serviceKey) {
    console.log("SUPABASE_SERVICE_ROLE_KEY가 없어 건너뜁니다 (대시보드 → Project Settings → API Keys)");
    return;
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: listings, error: le } = await admin.from("listings").select("images");
  if (le) throw le;
  const referenced = new Set<string>();
  for (const l of listings ?? [])
    for (const u of (l.images as string[] | null) ?? []) {
      // public URL → 버킷 내 경로 (userId/파일명)
      const m = u.match(/listing-images\/(.+)$/);
      if (m) referenced.add(decodeURIComponent(m[1]));
    }

  const { data: folders, error: fe } = await admin.storage.from("listing-images").list("", { limit: 1000 });
  if (fe) throw fe;
  const orphans: string[] = [];
  for (const folder of folders ?? []) {
    if (folder.id) continue; // 최상위 파일(폴더 아님)은 업로드 경로 규칙 밖 — 놔둔다
    const { data: objs, error: oe } = await admin.storage.from("listing-images")
      .list(folder.name, { limit: 1000 });
    if (oe) throw oe;
    for (const o of objs ?? []) {
      const path = `${folder.name}/${o.name}`;
      // 방금 업로드되어 아직 리스팅에 안 붙었을 수 있는 파일은 보호 (1시간 유예)
      const fresh = o.created_at && Date.now() - new Date(o.created_at).getTime() < 60 * 60 * 1000;
      if (!referenced.has(path) && !fresh) orphans.push(path);
    }
  }

  console.log(`참조 중 ${referenced.size}개 / 고아 ${orphans.length}개`);
  if (orphans.length === 0) return;
  if (dryRun) return orphans.forEach((p) => console.log("고아:", p));
  const { error: re } = await admin.storage.from("listing-images").remove(orphans);
  if (re) throw re;
  console.log(`${orphans.length}개 삭제 완료`);
}

main().catch((e) => { console.error(e); process.exit(1); });
