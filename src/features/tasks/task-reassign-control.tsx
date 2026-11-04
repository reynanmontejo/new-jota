"use client"

import { useState } from "react"
import { ArrowRightLeft, LoaderCircle } from "lucide-react"
import { listVideoTaskAssigneesAction, reassignVideoTaskAction } from "@/app/tasks/actions"
import { Button } from "@/components/ui/button"
import { useWorkflow } from "@/features/workflow/workflow-provider"
import type { WorkflowTask } from "@/features/workflow/types"

export function TaskReassignControl({ task }: { task: WorkflowTask }) {
  const { currentUser, clients, refreshWorkflowQuietly, demoMode } = useWorkflow()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [people, setPeople] = useState<Array<{ user_id: string; display_name: string; job_title: string | null }>>([])
  const [assignee, setAssignee] = useState("")
  const [expectedOwner, setExpectedOwner] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const manager = currentUser.role === "supervisor" || clients.find((client) => client.id === task.clientId)?.members?.some((member) => member.id === currentUser.id && member.clientRoles?.includes("account_manager"))
  if (demoMode || !manager || task.contentCategory !== "video" || !task.requiresReview || !task.contentItemId || !["todo", "in_progress", "revision_requested"].includes(task.status)) return null

  async function show() {
    setOpen(true); setBusy(true); setError(null); setSaved(false)
    setPeople([])
    setExpectedOwner(task.primaryOwner.id === "unassigned" ? null : task.primaryOwner.id)
    setAssignee(task.primaryOwner.id === "unassigned" ? "" : task.primaryOwner.id)
    try {
      const result = await listVideoTaskAssigneesAction(task.id)
      setPeople(result.people); setError(result.error)
    } catch { setError("Could not load video producers. Try again.") }
    finally { setBusy(false) }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null)
    try {
      const result = await reassignVideoTaskAction({ taskId: task.id, assigneeId: assignee || null, expectedOwner, reason })
      if (result.error) { setError(result.error); return }
      const refreshed = await refreshWorkflowQuietly()
      setOpen(false); setSaved(true); setReason("")
      if (!refreshed) setError("Assignment saved. Refresh the task to see the updated owner.")
    } catch { setError("Could not confirm reassignment. Reload the assignment before trying again.") }
    finally { setBusy(false) }
  }

  return <div className="mt-3">
    {!open && <Button type="button" variant="outline" size="sm" onClick={() => void show()}><ArrowRightLeft className="size-3.5" />Reassign task</Button>}
    {saved && <p role="status" className="mt-2 text-xs text-muted-foreground">Assignment saved. Files and history were kept.</p>}
    {open && <form onSubmit={save} className="grid gap-3 rounded-xl border border-primary/20 bg-background/65 p-3">
      <label className="grid gap-1 text-xs font-semibold">Video producer<select aria-label="Reassign video producer" value={assignee} onChange={(event) => setAssignee(event.target.value)} disabled={busy} className="h-9 rounded-lg border bg-background px-2 text-xs"><option value="">Unassigned — assign later</option>{task.primaryOwner.id !== "unassigned" && !people.some((person) => person.user_id === task.primaryOwner.id) && <option value={task.primaryOwner.id}>{task.primaryOwner.name} (current owner)</option>}{people.map((person) => <option key={person.user_id} value={person.user_id}>{person.display_name}{person.job_title ? ` · ${person.job_title}` : ""}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold">Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={2} maxLength={1000} required disabled={busy} className="min-h-16 rounded-lg border bg-background p-2 text-xs" /></label>
      <p className="text-xs text-muted-foreground">The task returns to To do. Both owners are notified; files and review history stay attached. Client defaults and content ownership stay unchanged.</p>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" size="sm" disabled={busy || people.length === 0 || reason.trim().length < 2 || assignee === (task.primaryOwner.id === "unassigned" ? "" : task.primaryOwner.id)}>{busy && <LoaderCircle className="size-3.5 animate-spin" />}Save assignment</Button></div>
    </form>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </div>
}
