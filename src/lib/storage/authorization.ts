import "server-only"

import { createClient } from "@/lib/supabase/server"

export type StorageActor = { userId: string; organizationId: string; supabase: Awaited<ReturnType<typeof createClient>> }

export async function getStorageActor(): Promise<StorageActor | null> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null
  const { data: profile, error } = await supabase.from("profiles").select("organization_id,status,deactivated_at").eq("id", user.id).maybeSingle()
  if (error || !profile || profile.status !== "active" || profile.deactivated_at) return null
  return { userId: user.id, organizationId: profile.organization_id, supabase }
}

export async function hasStoragePermission(actor: StorageActor, codes: string[]) {
  const { data: roles, error: rolesError } = await actor.supabase.from("user_roles").select("role_id").eq("organization_id", actor.organizationId).eq("user_id", actor.userId)
  if (rolesError || !roles?.length) return false
  const { data: permissions, error } = await actor.supabase.from("role_permissions").select("permission_code")
    .eq("organization_id", actor.organizationId).in("role_id", roles.map((role) => role.role_id)).in("permission_code", codes)
  return !error && Boolean(permissions?.length)
}
