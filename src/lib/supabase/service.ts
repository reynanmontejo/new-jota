import "server-only"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import { getServerSupabaseEnv } from "@/lib/env"

export function createServiceClient() {
  const { url, serviceRoleKey } = getServerSupabaseEnv()
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
