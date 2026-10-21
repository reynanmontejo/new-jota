import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"

type RoleRecord = { id: string; code: string; name: string }

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
      .select("organization_id,role_id")
      .eq("user_id", authData.user.id),
  ])
  const { data: profile, error: profileError } = profileResult
  if (profileError || !profile || profile.status !== "active" || profile.deactivated_at) return null

  const { data: memberships, error: membershipsError } = membershipsResult
  const roleIds = [...new Set((memberships ?? [])
    .filter(({ organization_id }) => organization_id === profile.organization_id)
    .map(({ role_id }) => role_id))]
  if (membershipsError || !roleIds.length) return null

  const { data: roles, error: rolesError } = await supabase.from("roles")
    .select("id,code,name")
    .eq("organization_id", profile.organization_id)
    .in("id", roleIds)
  if (rolesError || !roles?.length) return null

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
