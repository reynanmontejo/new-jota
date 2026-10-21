import type { ReactNode } from "react"

import { TaskDrawerProvider } from "@/features/tasks/task-drawer"
import { WorkflowProvider } from "@/features/workflow/workflow-provider"
import { loadWorkflowData } from "@/features/workflow/workflow-data"
import { isSupabaseConfigured } from "@/lib/env"
import { getAuthenticatedAppUser } from "@/lib/supabase/profile"

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const demoMode = !isSupabaseConfigured()
  const initialUser = demoMode ? null : await getAuthenticatedAppUser()
  const workflowData = demoMode || !initialUser ? null : await loadWorkflowData()

  return (
    <WorkflowProvider
      initialUser={initialUser}
      initialTasks={workflowData?.tasks}
      initialClients={workflowData?.clients}
      initialAssignableUsers={workflowData?.assignableUsers}
      initialUpcomingContent={workflowData?.upcomingContent}
      initialContentWorkItems={workflowData?.contentWorkItems}
      demoMode={demoMode}
    >
      <TaskDrawerProvider>{children}</TaskDrawerProvider>
    </WorkflowProvider>
  )
}
