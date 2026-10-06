import type { WorkflowTask } from "@/features/workflow/types"

/** Prefer the database timestamp; parse legacy display strings only for demo data. */
export function getTaskDueTimestamp(task: Pick<WorkflowTask, "dueAt" | "dueDate">) {
  const value = task.dueAt || task.dueDate.replace(/\s*[·•]\s*/g, " ")
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY
}

export function isTaskDueOnDate(task: Pick<WorkflowTask, "dueAt" | "dueDate">, date: Date) {
  const timestamp = getTaskDueTimestamp(task)
  if (!Number.isFinite(timestamp)) return false
  const due = new Date(timestamp)
  return due.getFullYear() === date.getFullYear()
    && due.getMonth() === date.getMonth()
    && due.getDate() === date.getDate()
}

export function taskDueLabel(task: Pick<WorkflowTask, "dueAt" | "dueDate">, now = new Date()) {
  const timestamp = getTaskDueTimestamp(task)
  if (!Number.isFinite(timestamp)) return task.dueDate
  const due = new Date(timestamp)
  if (due.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(due)
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(due)
}
