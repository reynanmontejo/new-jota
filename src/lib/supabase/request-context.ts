import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"

type RoleRecord = { id: string; code: string; name: string }
type MembershipRecord = { organization_id: string; role_id: string; role: RoleRecord | null }

export type WorkspaceRequestContext = {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  organizationId: string
  displayName: string
  jobTitle: string | null
  avatarUrl: string | null
  roleIds: string[]
  roles: RoleRecord[]
}

/**
 * Resolve the current user's verified workspace context once per RSC request.
 * React.cache is request-scoped; it does not keep profile or permission data
 * between requests or users.
 */
export const getWorkspaceRequestContext = cache(async (): Promise<WorkspaceRequestContext | null> => {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return null

  const [profileResult, membershipsResult] = await Promise.all([
    supabase.from("profiles")
      .select("id,organization_id,display_name,job_title,avatar_url,status,deactivated_at")
      .eq("id", authData.user.id)
      .maybeSingle(),
    // RLS scopes this to the active user's organization; the profile read runs
    // alongside it rather than adding another serial database round trip.
    supabase.from("user_roles")
      .select("organization_id,role_id,role:roles!user_roles_organization_id_role_id_fkey(id,code,name)")
      .eq("user_id", authData.user.id),
  ])
  const { data: profile, error: profileError } = profileResult
  if (profileError || !profile || profile.status !== "active" || profile.deactivated_at) return null

  const { data: memberships, error: membershipsError } = membershipsResult
  if (membershipsError) return null
  const roles = ((memberships ?? []) as unknown as MembershipRecord[])
    .filter(({ organization_id }) => organization_id === profile.organization_id)
    .flatMap(({ role }) => role ? [role] : [])
  const roleIds = [...new Set(roles.map(({ id }) => id))]
  if (!roleIds.length) return null

  return {
    supabase,
    userId: authData.user.id,
    organizationId: profile.organization_id,
    displayName: profile.display_name,
    jobTitle: profile.job_title,
    avatarUrl: profile.avatar_url,
    roleIds,
    roles,
  }
})
