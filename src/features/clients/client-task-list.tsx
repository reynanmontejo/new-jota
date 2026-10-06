"use client"

import { CalendarDays } from "lucide-react"

import { StatusBadge } from "@/features/workflow/status-badge"
import { taskDueLabel } from "@/features/workflow/task-dates"
import type { WorkflowTask } from "@/features/workflow/types"
import { useTaskDrawer } from "@/features/tasks/task-drawer"
import { useWorkflow } from "@/features/workflow/workflow-provider"

export function ClientTaskList({ tasks, clientId, limit }: { tasks?: WorkflowTask[]; clientId?: string; limit?: number }) {
  const { tasks: workspaceTasks } = useWorkflow()
  const { openTask } = useTaskDrawer()
  const visibleTasks = (tasks ?? workspaceTasks.filter((task) => !clientId || task.clientId === clientId)).slice(0, limit)
  if (!visibleTasks.length) return <div className="rounded-md border border-dashed border-border p-8 text-center text-xs text-muted-foreground">No tasks are visible for this client yet.</div>

  return <section aria-label="Client tasks" className="overflow-hidden rounded-lg border border-border">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] border-b bg-muted/25 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid-cols-[minmax(0,1fr)_140px_120px]">
      <span>Task</span><span className="hidden sm:block">Due</span><span>Status</span>
    </div>
    {visibleTasks.map((task) => <button key={task.id} type="button" onClick={() => openTask(task.id)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-3 text-left last:border-b-0 hover:bg-muted/35 sm:grid-cols-[minmax(0,1fr)_140px_120px]">
      <span className="min-w-0"><span className="block truncate text-xs font-semibold">{task.title}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{task.campaign} · {task.primaryOwner.name}</span></span>
      <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex"><CalendarDays aria-hidden="true" className="size-3" />{taskDueLabel(task)}</span>
      <StatusBadge status={task.status} />
    </button>)}
  </section>
}
