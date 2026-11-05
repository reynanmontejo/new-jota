import type { ReactNode } from "react"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { TaskDrawerProvider } from "@/features/tasks/task-drawer"
import { WorkflowProvider } from "@/features/workflow/workflow-provider"
import { isSupabaseConfigured } from "@/lib/env"
import { getAuthenticatedAppUser } from "@/lib/supabase/profile"
import { AssistantLoader } from "@/features/assistant/assistant-loader"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const demoMode = !isSupabaseConfigured()
  const initialUser = demoMode ? null : await getAuthenticatedAppUser()

  return (
    <WorkflowProvider initialUser={initialUser} demoMode={demoMode}>
      <TaskDrawerProvider>
        <DashboardShell>{children}</DashboardShell>
        {initialUser && <AssistantLoader key={initialUser.id} userId={initialUser.id} userName={initialUser.name} canReceive={initialUser.role === "supervisor"} />}
      </TaskDrawerProvider>
    </WorkflowProvider>
  )
}
