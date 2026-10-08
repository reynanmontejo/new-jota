import Link from "next/link"

import { restoreTaskFromTrashAction } from "@/app/tasks/actions"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Button } from "@/components/ui/button"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

type TrashedTask = {
  task_id: string
  title: string
  client_name: string
  deleted_at: string
  created_by: string | null
  assigned_to: string | null
}

export default async function TaskTrashPage({ searchParams }: { searchParams: Promise<{ notice?: string | string[] }> }) {
  const params = await searchParams
  let rows: TrashedTask[] = []
  let loadError: string | null = null
  const supabase = isSupabaseConfigured() ? await createClient() : null

  if (supabase) {
    const result = await supabase.rpc("workflow_list_task_trash")
    if (result.error) loadError = "Could not load task Trash. Check that the task management migration has been applied."
    else rows = (result.data ?? []) as TrashedTask[]
  }

  const profileIds = [...new Set(rows.flatMap((task) => [task.assigned_to, task.created_by].filter((id): id is string => Boolean(id))))]
  const profileResult = supabase && profileIds.length
    ? await supabase.from("profiles").select("id,display_name").in("id", profileIds)
    : { data: [], error: null }
  const profileNames = new Map(((profileResult.data ?? []) as { id: string; display_name: string }[]).map((profile) => [profile.id, profile.display_name]))
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice

  return <DashboardShell><main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
    <Link href="/clients?tab=files" className="text-xs font-medium text-muted-foreground hover:text-foreground">← Back to files</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Task management</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Task Trash</h1>
        <p className="mt-1 text-sm text-muted-foreground">Mistaken tasks can be restored. Cancel stopped work; keep reviewed work in its history.</p>
      </div>
      <p className="rounded-full border border-primary/15 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? "task" : "tasks"}</p>
    </div>

    {notice === "restored" && <p role="status" className="mt-4 rounded-lg border border-emerald-700/20 bg-emerald-700/5 px-3 py-2 text-xs text-emerald-800">Task restored to the active task list.</p>}
    {notice === "trashed" && <p role="status" className="mt-4 rounded-lg border border-emerald-700/20 bg-emerald-700/5 px-3 py-2 text-xs text-emerald-800">Task moved to Trash. You can restore it here.</p>}
    {notice === "restore-failed" && <p role="alert" className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">The task could not be restored. Check your access and try again.</p>}

    <section className="mt-5 overflow-hidden rounded-2xl border bg-card/70" aria-label="Trashed tasks">
      {loadError ? <p role="alert" className="p-5 text-sm text-destructive">{loadError}</p>
        : !supabase ? <p className="p-5 text-sm text-muted-foreground">Task Trash is available after connecting the database.</p>
          : rows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No tasks in Trash.</p>
            : <div className="divide-y">{rows.map((task) => {
              const assignee = task.assigned_to ? profileNames.get(task.assigned_to) : null
              const creator = task.created_by ? profileNames.get(task.created_by) : null
              const ownerContext = assignee ? `Assigned to ${assignee}` : creator ? `Created by ${creator}` : "Task owner unavailable"
              return <article key={task.task_id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{task.title}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {task.client_name} · {ownerContext} · Moved {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(task.deleted_at))}
                  </p>
                </div>
                <form action={restoreTaskFromTrashAction.bind(null, task.task_id)}>
                  <Button type="submit" variant="outline" size="sm">Restore</Button>
                </form>
              </article>
            })}</div>}
    </section>
  </main></DashboardShell>
}
