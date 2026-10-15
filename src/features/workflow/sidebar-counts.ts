type SidebarTask = { id: string; status: string; created_by: string | null }
type SidebarAssignee = { task_id: string; user_id: string; is_primary: boolean }

export function countOpenSidebarTasks(
  tasks: SidebarTask[],
  assignees: SidebarAssignee[],
  currentUser: { id: string; role: "employee" | "supervisor" },
) {
  const ownerByTask = new Map<string, { userId: string; primary: boolean }>()
  for (const assignment of assignees) {
    const current = ownerByTask.get(assignment.task_id)
    if (!current || assignment.is_primary && !current.primary) {
      ownerByTask.set(assignment.task_id, { userId: assignment.user_id, primary: assignment.is_primary })
    }
  }

  return tasks.filter((task) => {
    if (["approved", "completed", "cancelled"].includes(task.status)) return false
    if (currentUser.role === "supervisor") return true
    return (ownerByTask.get(task.id)?.userId ?? task.created_by) === currentUser.id
  }).length
}
