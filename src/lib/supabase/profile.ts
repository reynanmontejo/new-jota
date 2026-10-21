import type { DemoUser } from "@/features/workflow/task-permissions"
import { isSupabaseConfigured } from "@/lib/env"
import { getWorkspaceRequestContext } from "@/lib/supabase/request-context"

export async function getAuthenticatedAppUser(): Promise<DemoUser | null> {
  if (!isSupabaseConfigured()) return null

  const context = await getWorkspaceRequestContext()
  if (!context) return null
  const role = context.roles.find((item) => item.code === "administrator") ?? context.roles[0]
  if (!role) return null

  return {
    id: context.userId,
    name: context.displayName,
    role: role.code === "supervisor" || role.code === "administrator" ? "supervisor" : "employee",
    title: role.name,
    jobTitle: context.jobTitle,
    avatarUrl: context.avatarUrl,
  }
}
