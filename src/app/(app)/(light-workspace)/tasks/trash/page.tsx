import Link from "next/link"
import { ArrowLeft, Trash2 } from "lucide-react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { TaskTrashManager, type TaskTrashItem } from "@/features/tasks/task-trash-manager"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

type TrashedTask = Omit<TaskTrashItem, "ownerLabel"> & { created_by: string | null; assigned_to: string | null }

export default async function TaskTrashPage({ searchParams }: { searchParams: Promise<{ notice?: string | string[] }> }) {
  const params = await searchParams
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice
  let rows: TrashedTask[] = []
  let loadError: string | null = null
  let retentionReady = false
  const supabase = isSupabaseConfigured() ? await createClient() : null
  if (supabase) {
    const result = await supabase.rpc("workflow_list_task_trash_with_retention")
    if (result.error?.code === "PGRST202") {
      const legacy = await supabase.rpc("workflow_list_task_trash")
      if (legacy.error) loadError = "Could not load Task Trash. Apply the pending task migrations, then try again."
      else rows = (legacy.data ?? []) as TrashedTask[]
    } else if (result.error) loadError = "Could not load Task Trash. Refresh and try again."
    else { rows = (result.data ?? []) as TrashedTask[]; retentionReady = true }
  }
  const profileIds = [...new Set(rows.flatMap((task) => [task.assigned_to, task.created_by].filter((id): id is string => Boolean(id))))]
  const profileResult = supabase && profileIds.length
    ? await supabase.from("profiles").select("id,display_name").in("id", profileIds)
    : { data: [], error: null }
  const names = new Map(((profileResult.data ?? []) as { id: string; display_name: string }[]).map((profile) => [profile.id, profile.display_name]))
  const items: TaskTrashItem[] = rows.map((task) => ({ ...task,
    ownerLabel: task.assigned_to && names.get(task.assigned_to) ? `Assigned to ${names.get(task.assigned_to)}`
      : task.created_by && names.get(task.created_by) ? `Created by ${names.get(task.created_by)}` : "Task owner unavailable",
  }))
  return <DashboardShell><main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
    <Link href="/tasks" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" aria-hidden="true" />Back to tasks</Link>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl border border-primary/15 bg-primary/10 text-primary"><Trash2 className="size-5" aria-hidden="true" /></span><div><h1 className="text-2xl font-semibold tracking-tight">Task Trash</h1><p className="mt-0.5 text-xs text-muted-foreground">Restore removed work or permanently clear it.</p></div></div><p className="rounded-full border border-primary/15 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? "task" : "tasks"}</p></div>
    {notice === "restored" && <p role="status" className="mt-4 rounded-lg border border-emerald-600/20 bg-emerald-600/5 px-3 py-2 text-xs">Task restored to the task board.</p>}
    {notice === "trashed" && <p role="status" className="mt-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">Task moved to Trash.</p>}
    {notice === "restore-failed" && <p role="alert" className="mt-4 text-xs text-destructive">Could not restore this task. Check your access and its expiry date.</p>}
    {loadError ? <p role="alert" className="mt-5 rounded-xl border p-5 text-sm text-destructive">{loadError}</p>
      : !supabase ? <p className="mt-5 rounded-xl border p-5 text-sm text-muted-foreground">Task Trash is available after connecting the database.</p>
        : <TaskTrashManager items={items} retentionReady={retentionReady} referenceTime={new Date().getTime()} />}
  </main></DashboardShell>
}
