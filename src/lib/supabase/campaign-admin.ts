import "server-only"

import { getWorkspaceRequestContext } from "@/lib/supabase/request-context"

export type CampaignPermissions = {
  canCreate: boolean
  canUpdate: boolean
  canArchive: boolean
}

export async function getCampaignPermissions(): Promise<CampaignPermissions> {
  const none = { canCreate: false, canUpdate: false, canArchive: false }
  const context = await getWorkspaceRequestContext()
  if (!context) return none

  const { data: rows, error: permissionError } = await context.supabase.from("role_permissions")
    .select("permission_code")
    .eq("organization_id", context.organizationId)
    .in("role_id", context.roleIds)
    .in("permission_code", ["campaigns.create", "campaigns.update", "campaigns.delete"])
  if (permissionError) return none
  const codes = new Set((rows ?? []).map(({ permission_code }) => permission_code))
  return {
    canCreate: codes.has("campaigns.create"),
    canUpdate: codes.has("campaigns.update"),
    canArchive: codes.has("campaigns.delete"),
  }
}
