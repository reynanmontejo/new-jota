import "server-only"

import { getWorkspaceRequestContext } from "@/lib/supabase/request-context"

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
  const context = await getWorkspaceRequestContext()
  if (!context) return { context: null, permissions: [], roleCodes: [] }

  const { data: permissions, error: permissionsError } = await context.supabase.from("role_permissions").select("permission_code")
    .eq("organization_id", context.organizationId).in("role_id", context.roleIds)
  if (permissionsError) return { context: null, permissions: [], roleCodes: [] }
  return {
    context: { actorId: context.userId, organizationId: context.organizationId },
    permissions: [...new Set((permissions ?? []).map(({ permission_code }) => permission_code))],
    roleCodes: [...new Set(context.roles.map(({ code }) => code))],
  }
}

export async function getEmployeeManagementContext(
  requiredPermission: EmployeeManagementPermission,
): Promise<EmployeeManagementContext | null> {
  const access = await getEmployeeManagementAccess()
  return access.context && access.permissions.includes(requiredPermission) ? access.context : null
}

export async function getAdministratorContext(): Promise<EmployeeManagementContext | null> {
  const context = await getWorkspaceRequestContext()
  if (!context || !context.roles.some((role) => role.code === "administrator" && context.roleIds.includes(role.id))) return null
  return { actorId: context.userId, organizationId: context.organizationId }
}
