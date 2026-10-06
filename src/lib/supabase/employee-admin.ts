import "server-only"
import { createClient } from "@/lib/supabase/server"

export type EmployeeManagementContext = { actorId: string; organizationId: string }

export async function getEmployeeManagementContext(
  requiredPermission: "employees.view" | "employees.create" | "employees.update" | "employees.deactivate" | "employees.delete",
): Promise<EmployeeManagementContext | null> {
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
    .in("role_id", memberships.map(({ role_id }) => role_id)).eq("permission_code", requiredPermission).limit(1)
  if (permissionError || !permission?.length) return null
  return { actorId: authData.user.id, organizationId: profile.organization_id }
}
