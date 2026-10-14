import "server-only"
import { createClient } from "@/lib/supabase/server"

export type EmployeeManagementContext = { actorId: string; organizationId: string }
export type EmployeeManagementPermission =
  | "employees.view"
  | "employees.create"
  | "employees.update"
  | "employees.deactivate"
  | "employees.delete"

export async function getEmployeeManagementAccess(): Promise<{
  context: EmployeeManagementContext | null
  permissions: string[]
  roleCodes: string[]
}> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return { context: null, permissions: [], roleCodes: [] }
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("organization_id, status, deactivated_at").eq("id", authData.user.id).maybeSingle()
  if (profileError || !profile || profile.status !== "active" || profile.deactivated_at) {
    return { context: null, permissions: [], roleCodes: [] }
  }
  const { data: memberships, error: membershipsError } = await supabase.from("user_roles")
    .select("role_id").eq("organization_id", profile.organization_id).eq("user_id", authData.user.id)
  const roleIds = [...new Set((memberships ?? []).map(({ role_id }) => role_id))]
  if (membershipsError || !roleIds.length) return { context: null, permissions: [], roleCodes: [] }

  const [rolesResult, permissionsResult] = await Promise.all([
    supabase.from("roles").select("code").eq("organization_id", profile.organization_id).in("id", roleIds),
    supabase.from("role_permissions").select("permission_code")
      .eq("organization_id", profile.organization_id).in("role_id", roleIds),
  ])
  if (rolesResult.error || permissionsResult.error) return { context: null, permissions: [], roleCodes: [] }
  return {
    context: { actorId: authData.user.id, organizationId: profile.organization_id },
    permissions: [...new Set((permissionsResult.data ?? []).map(({ permission_code }) => permission_code))],
    roleCodes: [...new Set((rolesResult.data ?? []).map(({ code }) => code))],
  }
}

export async function getEmployeeManagementContext(
  requiredPermission: EmployeeManagementPermission,
): Promise<EmployeeManagementContext | null> {
  const access = await getEmployeeManagementAccess()
  return access.context && access.permissions.includes(requiredPermission) ? access.context : null
}

export async function getAdministratorContext(): Promise<EmployeeManagementContext | null> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return null
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("organization_id,status,deactivated_at").eq("id", authData.user.id).maybeSingle()
  if (profileError || !profile || profile.status !== "active" || profile.deactivated_at) return null
  const { data: memberships, error: membershipsError } = await supabase.from("user_roles")
    .select("role_id").eq("organization_id", profile.organization_id).eq("user_id", authData.user.id)
  if (membershipsError || !memberships?.length) return null
  const { data: adminRole, error: roleError } = await supabase.from("roles")
    .select("id").eq("organization_id", profile.organization_id).eq("code", "administrator")
    .in("id", memberships.map(({ role_id }) => role_id)).maybeSingle()
  if (roleError || !adminRole) return null
  return { actorId: authData.user.id, organizationId: profile.organization_id }
}
