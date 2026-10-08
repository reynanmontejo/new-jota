"use client"

import Link from "next/link"
import { FormEvent, useState } from "react"
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  LockKeyhole,
  MessageSquare,
  Paperclip,
  Send,
  UploadCloud,
  UserRound,
  Users,
} from "lucide-react"

import { ContentState, UploadProgress } from "@/components/states/content-state"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatusBadge, getStatusLabel } from "@/features/workflow/status-badge"
import { ClientFiles } from "@/features/clients/client-files"
import { TaskTrashButton } from "@/features/tasks/task-trash-button"
import { canEditTask, canViewTask, taskStatusOptions } from "@/features/workflow/task-permissions"
import type { TaskStatus, WorkflowFile } from "@/features/workflow/types"
import { useWorkflow } from "@/features/workflow/workflow-provider"
import { cn } from "@/lib/utils"

export function TaskDetail({ taskId, embedded = false }: { taskId: string; embedded?: boolean }) {
  const { tasks, currentUser, demoMode, toggleChecklist, addComment, updateStatus, createVersion, submitLatestVersion } = useWorkflow()
  const task = tasks.find((item) => item.id === taskId)
  const [comment, setComment] = useState("")
  const [versionNotes, setVersionNotes] = useState("")
  const [upload, setUpload] = useState<{ fileName: string; progress: number; status: "uploading" | "complete" | "error" } | null>(null)

  if (!task) return <ContentState variant="empty" title="Task not found" description="This task does not exist or has been removed." />
  if (!canViewTask(task, currentUser)) return <ContentState variant="access_denied" title="Task access restricted" description="Only the assigned employee and supervisors can view this task." />

  const taskTitle = task.title
  const latestVersion = task.versions.at(-1)
  const completedChecklist = task.checklist.filter((item) => item.completed).length
  const checklistProgress = task.checklist.length === 0 ? 0 : Math.round((completedChecklist / task.checklist.length) * 100)
  const canEdit = canEditTask(task, currentUser.id)
  const statusOptions = taskStatusOptions(task, currentUser)
  const canManageTrash = currentUser.role === "supervisor" || task.primaryOwner.id === currentUser.id
  const trashStatusEligible = ["todo", "in_progress", "cancelled"].includes(task.status)
  const trashBlockedByHistory = Boolean(task.hasSubmissions) || task.versions.length > 0 || task.comments.length > 0 || (task.fileCount ?? 0) > 0
  const trashEligibilityUnknown = task.fileCount === null
  const trashUnavailableMessage = !trashStatusEligible
    ? "Tasks under review, approved, or completed stay in the task history."
    : trashBlockedByHistory
      ? "This task has files, comments, or review history. Cancel it instead so its history stays available."
      : trashEligibilityUnknown
        ? "Task files could not be checked. Trash is unavailable until their status can be verified."
        : null

  async function handleComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = comment.trim()
    if (!body || !canEdit) return
    if (await addComment(taskId, body)) setComment("")
  }

  async function handleFile(file: File | undefined) {
    if (!file || !canEdit) return
    if (file.size > 10_000_000) {
      setUpload({ fileName: file.name, progress: 34, status: "error" })
      return
    }

    setUpload({ fileName: file.name, progress: 18, status: "uploading" })
    await new Promise((resolve) => window.setTimeout(resolve, 220))
    setUpload({ fileName: file.name, progress: 64, status: "uploading" })
    await new Promise((resolve) => window.setTimeout(resolve, 260))
    setUpload({ fileName: file.name, progress: 100, status: "complete" })

    const workflowFile: WorkflowFile = { id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type || "application/octet-stream" }
    createVersion(taskId, workflowFile, versionNotes.trim() || `Updated work for ${taskTitle}.`)
    setVersionNotes("")
  }

  return (
    <main className={embedded ? "px-4 py-5 sm:px-6" : "mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6"}>
      {!embedded && <Link href={demoMode ? `/clients/${task.clientId}?tab=tasks` : "/tasks"} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Back to {demoMode ? task.clientName : "tasks"}</Link>}

      <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between", embedded ? "mt-2" : "mt-4")}>
        <div>
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={task.status} /><Badge variant="outline" className="capitalize">{task.priority} priority</Badge></div>
          <h1 className={cn("mt-2 font-semibold tracking-tight", embedded ? "text-xl" : "text-2xl sm:text-[28px]")}>{task.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{task.clientName} · {task.campaign} · {task.contentItem}</p>
        </div>
        {statusOptions.length > 0 && <label className="flex items-center gap-2 rounded-xl border border-primary/20 bg-background/65 px-3 py-2 text-xs font-semibold">
          Status
          <select value={task.status} onChange={(event) => {
            const nextStatus = event.target.value as TaskStatus
            if (nextStatus === "cancelled" && !window.confirm("Cancel this task? Its files and review history will be kept.")) return
            void updateStatus(task.id, nextStatus)
          }} className="bg-transparent text-foreground outline-none">
            {[task.status, ...statusOptions].map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
          </select>
        </label>}
      </div>

      {!demoMode && canManageTrash && <div className="mt-3">{trashUnavailableMessage
        ? <p className="max-w-lg rounded-lg border border-primary/15 bg-background/45 px-3 py-2 text-xs text-muted-foreground">{trashUnavailableMessage}</p>
        : <TaskTrashButton taskId={task.id} />}</div>}

      <div className={cn("mt-4 grid items-start", embedded ? "gap-3" : "gap-5", !embedded && "xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.72fr)]")}>
        <div className={embedded ? "space-y-3" : "space-y-5"}>
          <section className={cn("glass-panel rounded-2xl border", embedded ? "p-3" : "p-5")}>
            <h2 className="text-sm font-semibold">Task details</h2>
            {task.description && <p className="mt-2 text-xs leading-5 text-muted-foreground">{task.description}</p>}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Detail icon={CalendarDays} label="Start date" value={task.startDate} compact={embedded} />
              <Detail icon={Clock3} label="Due date" value={task.dueDate} compact={embedded} />
              <Detail icon={UserRound} label="Owner" value={task.primaryOwner.name} compact={embedded} />
              <Detail icon={Users} label="Team" value={task.collaborators.map((member) => member.name).join(", ") || "None"} compact={embedded} />
            </div>
          </section>

          {!demoMode && latestVersion?.status === "revision_requested" && latestVersion.reviewComment && <div className="rounded-xl border border-[#9a6242]/25 bg-[#9a6242]/10 px-3 py-2.5"><p className="text-xs font-semibold text-[#7f5136] dark:text-secondary">Changes requested{latestVersion.reviewedBy ? ` · ${latestVersion.reviewedBy}` : ""}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{latestVersion.reviewComment}</p></div>}
          {!demoMode && <ClientFiles key={task.id} clientId={task.clientId} taskId={task.id} canUpload={canEdit} compact={embedded} />}
          {demoMode && <section className={cn("glass-panel rounded-2xl border", embedded ? "p-3" : "p-4")}>
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Work submission</h2><UploadCloud className="size-4 text-primary" /></div>
            {canEdit && <><textarea value={versionNotes} onChange={(event) => setVersionNotes(event.target.value)} placeholder="Add notes (optional)" className="mt-3 min-h-16 w-full resize-none rounded-xl border border-primary/20 bg-background/70 p-2.5 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/10" />
              <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-secondary/12 px-3 py-3 text-xs font-semibold text-primary transition hover:bg-secondary/22"><Paperclip className="size-4" /> Choose work file<input type="file" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0])} /></label></>}
            {upload && <div className="mt-3"><UploadProgress {...upload} onRetry={() => setUpload(null)} /></div>}
            {canEdit && latestVersion?.status === "draft" && <Button onClick={() => submitLatestVersion(task.id)} size="sm" className="mt-3 w-full bg-gradient-to-br from-primary to-accent text-primary-foreground">Submit V{latestVersion.number} for review</Button>}
            {latestVersion?.status === "submitted" && <p className="mt-3 flex items-center gap-2 rounded-lg bg-accent/14 p-2.5 text-xs font-semibold text-primary"><Clock3 className="size-4" /> Awaiting supervisor review</p>}
            {latestVersion?.status === "approved" && <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-600/10 p-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="size-4" /> Approved by {latestVersion.reviewedBy}</p>}
          </section>}

          <section className={cn("glass-panel rounded-2xl border", embedded ? "p-3" : "p-5")}>
            <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Checklist</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{completedChecklist}/{task.checklist.length} done</p></div><span className="text-xs font-semibold text-primary">{checklistProgress}%</span></div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary/25"><div className="h-full bg-gradient-to-r from-primary to-accent transition-[width]" style={{ width: `${checklistProgress}%` }} /></div>
            <div className="mt-3 space-y-1">{task.checklist.map((item) => <button key={item.id} disabled={!canEdit} onClick={() => toggleChecklist(task.id, item.id)} className="flex w-full items-center gap-2 rounded-lg border border-transparent p-2 text-left transition hover:border-primary/15 hover:bg-background/55 disabled:cursor-default"><span className={cn("grid size-4 place-items-center rounded-full border-2", item.completed ? "border-primary bg-primary text-primary-foreground" : "border-primary/30 bg-background")}><Check className="size-2.5" /></span><span className={cn("text-xs", item.completed && "text-muted-foreground line-through")}>{item.label}</span></button>)}</div>
          </section>

          <section className={cn("glass-panel rounded-2xl border", embedded ? "p-3" : "p-5")}>
            <div className="flex items-center gap-2"><MessageSquare className="size-4 text-primary" /><h2 className="text-sm font-semibold">Comments</h2></div>
            <div className="mt-3 space-y-3">{task.comments.length === 0 && <p className="rounded-lg bg-muted/35 p-3 text-xs text-muted-foreground">No comments yet.</p>}{task.comments.map((item) => <div key={item.id} className="flex gap-2"><Avatar className="size-7"><AvatarFallback className="bg-secondary/35 text-[9px]">{item.initials}</AvatarFallback></Avatar><div className="min-w-0 flex-1 rounded-lg bg-background/60 p-2.5"><div className="flex justify-between gap-3"><span className="text-xs font-semibold">{item.author}</span><span className="text-[10px] text-muted-foreground">{item.createdAt}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.body}</p></div></div>)}</div>
            {canEdit && <form onSubmit={handleComment} className="mt-4 flex gap-2"><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment..." aria-label="Comment" className="h-10 min-w-0 flex-1 rounded-xl border border-primary/20 bg-background/70 px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/10" /><Button type="submit" size="icon" aria-label="Post comment"><Send /></Button></form>}
          </section>
        </div>

        <aside className={embedded ? "space-y-3" : "space-y-5"}>
          <section className={cn("glass-panel rounded-2xl border", embedded ? "p-3" : "p-5")}>
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Version history</h2><LockKeyhole className="size-4 text-primary" /></div>
            {task.versions.length === 0 ? <p className="mt-3 rounded-lg bg-muted/35 p-3 text-xs text-muted-foreground">No submitted versions yet.</p> : <div className="mt-3 space-y-2">{[...task.versions].reverse().map((version) => <article key={version.id} className="rounded-lg border border-primary/14 bg-background/55 p-2.5"><div className="flex items-center justify-between"><span className="text-xs font-bold">V{version.number}</span><Badge variant="outline" className="capitalize text-[9px]">{version.status.replace("_", " ")}</Badge></div>{version.notes && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{version.notes}</p>}{version.reviewComment && <div className="mt-2 rounded-lg border border-[#9a6242]/20 bg-[#9a6242]/8 p-2.5"><p className="text-[10px] font-semibold text-[#7f5136] dark:text-secondary">{version.status === "approved" ? "Reviewer feedback" : "Changes requested"}{version.reviewedBy ? ` · ${version.reviewedBy}` : ""}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{version.reviewComment}</p></div>}{version.files.map((file) => <a key={file.id} href={`/api/files/${encodeURIComponent(file.id)}`} className="mt-2 flex items-center gap-2 rounded-lg bg-muted/35 p-2 hover:bg-muted/60"><FileText className="size-3.5 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-[11px] font-medium">{file.name}</span><Download className="size-3.5 shrink-0 text-muted-foreground" /></a>)}<p className="mt-1.5 text-[10px] text-muted-foreground">{version.submittedAt ?? "Draft"} · {version.submittedBy}{version.reviewedAt ? ` · reviewed ${version.reviewedAt}` : ""}</p></article>)}</div>}
          </section>

          {!embedded && <section className="glass-panel rounded-2xl border p-5"><div className="flex items-center gap-2"><Activity className="size-4 text-primary" /><h2 className="font-semibold">Activity</h2></div><div className="mt-4 space-y-4">{task.activity.map((item) => <div key={item.id} className="border-l-2 border-secondary pl-3"><p className="text-xs font-medium">{item.label}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{item.actor} · {item.createdAt}</p></div>)}</div></section>}
        </aside>
      </div>
    </main>
  )
}

function Detail({ icon: Icon, label, value, compact = false }: { icon: typeof CalendarDays; label: string; value: string; compact?: boolean }) {
  return <div className={cn("flex min-w-0 items-center rounded-lg bg-background/55", compact ? "gap-2 p-2" : "gap-3 p-3")}><span className={cn("grid shrink-0 place-items-center rounded-lg bg-secondary/30 text-primary", compact ? "size-7" : "size-8")}><Icon className={compact ? "size-3.5" : "size-4"} /></span><span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span><span className="mt-0.5 block truncate text-xs font-semibold">{value}</span></span></div>
}
