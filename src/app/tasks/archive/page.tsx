import Link from "next/link"

import { restoreTaskFromArchiveAction } from "@/app/tasks/actions"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Button } from "@/components/ui/button"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

type ArchivedTask = {
  task_id: string
  title: string
  client_name: string
  status: string
  archived_at: string
  archived_by: string | null
  created_by: string | null
  assigned_to: string | null
}

export default async function TaskArchivePage({ searchParams }: { searchParams: Promise<{ notice?: string | string[] }> }) {
  const params = await searchParams
  let rows: ArchivedTask[] = []
  let loadError: string | null = null
  const supabase = isSupabaseConfigured() ? await createClient() : null
  if (supabase) {
    const result = await supabase.rpc("workflow_list_task_archive")
    if (result.error) loadError = "Could not load the task archive. Apply the task archive migration in Supabase, then try again."
    else rows = (result.data ?? []) as ArchivedTask[]
  }

  const profileIds = [...new Set(rows.flatMap((task) => [task.assigned_to, task.created_by].filter((id): id is string => Boolean(id))))]
  const profileResult = supabase && profileIds.length
    ? await supabase.from("profiles").select("id,display_name").in("id", profileIds)
    : { data: [], error: null }
  const profileNames = new Map(((profileResult.data ?? []) as { id: string; display_name: string }[]).map((profile) => [profile.id, profile.display_name]))
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice

  return <DashboardShell><main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
    <Link href="/tasks" className="text-xs font-medium text-muted-foreground hover:text-foreground">← Back to tasks</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Task management</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Task archive</h1><p className="mt-1 text-sm text-muted-foreground">Completed work is hidden from the board but its files and review history stay intact.</p></div>
      <p className="rounded-full border border-primary/15 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? "task" : "tasks"}</p>
    </div>
    {notice === "restored" && <p role="status" className="mt-4 rounded-lg border border-emerald-700/20 bg-emerald-700/5 px-3 py-2 text-xs text-emerald-800">Task restored to the board.</p>}
    {notice === "restore-failed" && <p role="alert" className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">Could not restore this task. Check your access and try again.</p>}
    <section className="mt-5 overflow-hidden rounded-2xl border bg-card/70" aria-label="Archived tasks">
      {loadError ? <p role="alert" className="p-5 text-sm text-destructive">{loadError}</p>
        : !supabase ? <p className="p-5 text-sm text-muted-foreground">Task archive is available after connecting the database.</p>
          : rows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No archived tasks. Use a completed task’s menu to archive it.</p>
            : <div className="divide-y">{rows.map((task) => {
              const assignee = task.assigned_to ? profileNames.get(task.assigned_to) : null
              const creator = task.created_by ? profileNames.get(task.created_by) : null
              const owner = assignee ? `Assigned to ${assignee}` : creator ? `Created by ${creator}` : "Task owner unavailable"
              return <article key={task.task_id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{task.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{task.client_name} · {owner} · Archived {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(task.archived_at))}</p></div>
                <form action={restoreTaskFromArchiveAction.bind(null, task.task_id)}><Button type="submit" variant="outline" size="sm">Restore</Button></form>
              </article>
            })}</div>}
    </section>
  </main></DashboardShell>
}
