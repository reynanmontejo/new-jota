import type { ReactNode } from "react"

import { TaskDrawerProvider } from "@/features/tasks/task-drawer"
import { WorkflowProvider } from "@/features/workflow/workflow-provider"
import { isSupabaseConfigured } from "@/lib/env"
import { getAuthenticatedAppUser } from "@/lib/supabase/profile"

export default async function LightWorkspaceLayout({ children }: { children: ReactNode }) {
  const demoMode = !isSupabaseConfigured()
  const initialUser = demoMode ? null : await getAuthenticatedAppUser()

  return (
    <WorkflowProvider initialUser={initialUser} demoMode={demoMode}>
      <TaskDrawerProvider>{children}</TaskDrawerProvider>
    </WorkflowProvider>
  )
}
