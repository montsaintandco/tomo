import { createClient } from "@supabase/supabase-js";

// service_role 클라이언트 — RLS 밖에서 동작 (webhook 전용). 서버에서만 import.
export function createAdminSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}
