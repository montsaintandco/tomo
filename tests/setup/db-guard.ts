// T11: CI 에서는 임시 Supabase(127.0.0.1)에만 붙는다. 운영 주소가 들어오면 테스트를 시작하기 전에 멈춘다.
// 로컬 PC 실행(메인이 .env.local 로 운영 DB 확인)은 그대로 둔다.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (process.env.CI && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  throw new Error(`db-guard: CI 에서 로컬 Supabase 가 아닌 주소로 DB 테스트를 돌리려 함 (${url || "비어 있음"})`);
}
