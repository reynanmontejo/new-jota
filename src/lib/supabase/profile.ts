import type { DemoUser } from "@/features/workflow/task-permissions"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

export async function getAuthenticatedAppUser(): Promise<DemoUser | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return null

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, organization_id, display_name, job_title, avatar_url, status, deactivated_at")
    .eq("id", authData.user.id)
    .maybeSingle()

  if (error || !profile || profile.status !== "active" || profile.deactivated_at) return null

  const { data: memberships, error: membershipsError } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("organization_id", profile.organization_id)
    .eq("user_id", authData.user.id)
  if (membershipsError || !memberships?.length) return null

  const { data: roles, error: rolesError } = await supabase
    .from("roles")
    .select("code, name")
    .eq("organization_id", profile.organization_id)
    .in("id", memberships.map(({ role_id }) => role_id))
  if (rolesError || !roles?.length) return null

  const role = roles.find((item) => item.code === "administrator") ?? roles[0]
  if (!role) return null

  return {
    id: profile.id,
    name: profile.display_name,
    role: role.code === "supervisor" || role.code === "administrator" ? "supervisor" : "employee",
    title: role.name,
    jobTitle: profile.job_title,
    avatarUrl: profile.avatar_url,
  }
}
