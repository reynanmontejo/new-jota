import "server-only"

import { getWorkspaceRequestContext } from "@/lib/supabase/request-context"

export type ClientManagementContext = { actorId: string; organizationId: string }

export async function getClientManagementContext(): Promise<ClientManagementContext | null> {
  const context = await getWorkspaceRequestContext()
  if (!context) return null
  const { data: permission, error: permissionError } = await context.supabase.from("role_permissions")
    .select("permission_code").eq("organization_id", context.organizationId)
    .in("role_id", context.roleIds).eq("permission_code", "clients.manage").limit(1)
  if (permissionError || !permission?.length) return null
  return { actorId: context.userId, organizationId: context.organizationId }
}

export async function getClientAssignmentContext(): Promise<ClientManagementContext | null> {
  const context = await getWorkspaceRequestContext()
  if (!context) return null
  const { data: permission, error: permissionError } = await context.supabase.from("role_permissions")
    .select("permission_code").eq("organization_id", context.organizationId)
    .in("role_id", context.roleIds).eq("permission_code", "clients.assign").limit(1)
  if (permissionError || !permission?.length) return null
  return { actorId: context.userId, organizationId: context.organizationId }
}

export type ClientLifecyclePermissions = {
  canManageStatus: boolean
  canManageTrash: boolean
}

export async function getClientLifecyclePermissions(): Promise<ClientLifecyclePermissions | null> {
  const context = await getWorkspaceRequestContext()
  if (!context) return null
  const { data: permissions, error: permissionsError } = await context.supabase.from("role_permissions")
    .select("permission_code").eq("organization_id", context.organizationId)
    .in("role_id", context.roleIds)
    .in("permission_code", ["clients.manage", "clients.trash"])
  if (permissionsError) return null
  const codes = new Set((permissions ?? []).map(({ permission_code }) => permission_code))
  return { canManageStatus: codes.has("clients.manage") || codes.has("clients.trash"), canManageTrash: codes.has("clients.trash") }
}
