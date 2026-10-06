import "server-only"

import { createClient } from "@/lib/supabase/server"

export type CampaignPermissions = {
  canCreate: boolean
  canUpdate: boolean
  canArchive: boolean
}

export async function getCampaignPermissions(): Promise<CampaignPermissions> {
  const none = { canCreate: false, canUpdate: false, canArchive: false }
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return none

  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("organization_id,status,deactivated_at").eq("id", authData.user.id).maybeSingle()
  if (profileError || !profile || profile.status !== "active" || profile.deactivated_at) return none

  const { data: memberships, error: rolesError } = await supabase.from("user_roles")
    .select("role_id").eq("organization_id", profile.organization_id).eq("user_id", authData.user.id)
  if (rolesError || !memberships?.length) return none

  const { data: rows, error: permissionError } = await supabase.from("role_permissions")
    .select("permission_code")
    .eq("organization_id", profile.organization_id)
    .in("role_id", memberships.map(({ role_id }) => role_id))
    .in("permission_code", ["campaigns.create", "campaigns.update", "campaigns.delete"])
  if (permissionError) return none
  const codes = new Set((rows ?? []).map(({ permission_code }) => permission_code))
  return {
    canCreate: codes.has("campaigns.create"),
    canUpdate: codes.has("campaigns.update"),
    canArchive: codes.has("campaigns.delete"),
  }
}
