import { DashboardShell } from "@/components/layout/dashboard-shell"
import { TaskDetail } from "@/features/tasks/task-detail"

export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  return <DashboardShell><TaskDetail taskId={taskId} /></DashboardShell>
}
