import { DashboardShell } from "@/components/layout/dashboard-shell"
import { TaskList } from "@/features/tasks/task-list"

export default function TasksPage() {
  return <DashboardShell><TaskList /></DashboardShell>
}
