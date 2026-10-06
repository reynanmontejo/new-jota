import "server-only"

import { createClient } from "@/lib/supabase/server"

export type ClientManagementContext = { actorId: string; organizationId: string }

export async function getClientManagementContext(): Promise<ClientManagementContext | null> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return null
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("organization_id, status, deactivated_at").eq("id", authData.user.id).maybeSingle()
  if (profileError || !profile || profile.status !== "active" || profile.deactivated_at) return null
  const { data: memberships, error: membershipsError } = await supabase.from("user_roles")
    .select("role_id").eq("organization_id", profile.organization_id).eq("user_id", authData.user.id)
  if (membershipsError || !memberships?.length) return null
  const { data: permission, error: permissionError } = await supabase.from("role_permissions")
    .select("permission_code").eq("organization_id", profile.organization_id)
    .in("role_id", memberships.map(({ role_id }) => role_id)).eq("permission_code", "clients.manage").limit(1)
  if (permissionError || !permission?.length) return null
  return { actorId: authData.user.id, organizationId: profile.organization_id }
}

export async function getClientAssignmentContext(): Promise<ClientManagementContext | null> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return null
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("organization_id,status,deactivated_at").eq("id", authData.user.id).maybeSingle()
  if (profileError || !profile || profile.status !== "active" || profile.deactivated_at) return null
  const { data: memberships, error: membershipsError } = await supabase.from("user_roles")
    .select("role_id").eq("organization_id", profile.organization_id).eq("user_id", authData.user.id)
  if (membershipsError || !memberships?.length) return null
  const { data: permission, error: permissionError } = await supabase.from("role_permissions")
    .select("permission_code").eq("organization_id", profile.organization_id)
    .in("role_id", memberships.map(({ role_id }) => role_id)).eq("permission_code", "clients.assign").limit(1)
  if (permissionError || !permission?.length) return null
  return { actorId: authData.user.id, organizationId: profile.organization_id }
}

export type ClientLifecyclePermissions = {
  canManageStatus: boolean
  canManageTrash: boolean
}

export async function getClientLifecyclePermissions(): Promise<ClientLifecyclePermissions | null> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return null

  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("organization_id,status,deactivated_at").eq("id", authData.user.id).maybeSingle()
  if (profileError || !profile || profile.status !== "active" || profile.deactivated_at) return null

  const { data: memberships, error: membershipsError } = await supabase.from("user_roles")
    .select("role_id").eq("organization_id", profile.organization_id).eq("user_id", authData.user.id)
  if (membershipsError || !memberships?.length) return null

  const { data: permissions, error: permissionsError } = await supabase.from("role_permissions")
    .select("permission_code").eq("organization_id", profile.organization_id)
    .in("role_id", memberships.map(({ role_id }) => role_id))
    .in("permission_code", ["clients.manage", "clients.trash"])
  if (permissionsError) return null
  const codes = new Set((permissions ?? []).map(({ permission_code }) => permission_code))
  return { canManageStatus: codes.has("clients.manage") || codes.has("clients.trash"), canManageTrash: codes.has("clients.trash") }
}
