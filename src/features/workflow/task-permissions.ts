import type { TaskStatus, WorkflowTask } from "@/features/workflow/types"

export const currentEmployee = { id: "maria", name: "Maria Reyes", role: "employee" } as const
export const currentSupervisor = { id: "sarah", name: "Sarah Chen", role: "supervisor" } as const
export type DemoUser = {
  id: string
  name: string
  role: "employee" | "supervisor"
  title?: string
  jobTitle?: string | null
  avatarUrl?: string | null
}

export function canCreateTask(actor: DemoUser) {
  return actor.role === "employee" || actor.role === "supervisor"
}

export function canViewTask(task: WorkflowTask, actor: DemoUser) {
  return actor.role === "supervisor" || task.primaryOwner.id === actor.id
}

export function canEditTask(task: WorkflowTask, actorId: string) {
  return task.primaryOwner.id === actorId && !["for_review", "approved", "completed", "cancelled"].includes(task.status)
}

export function employeeStatusOptions(task: WorkflowTask, actorId: string): TaskStatus[] {
  if (!canEditTask(task, actorId) || task.status === "for_review") return []
  return ["todo", "in_progress"].filter((status) => status !== task.status) as TaskStatus[]
}

export function taskStatusOptions(task: WorkflowTask, actor: DemoUser): TaskStatus[] {
  if (actor.role === "supervisor") {
    return task.status === "approved" ? ["completed"] : []
  }
  return employeeStatusOptions(task, actor.id)
}
