"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Archive,
  ArrowDownAZ,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Columns3,
  LoaderCircle,
  ListPlus,
  LayoutList,
  MoreHorizontal,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  Undo2,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusBadge, getStatusLabel } from "@/features/workflow/status-badge"
import { useTaskDrawer } from "@/features/tasks/task-drawer"
import { ClientFiles } from "@/features/clients/client-files"
import { taskStatusOptions, type DemoUser } from "@/features/workflow/task-permissions"
import type { TaskStatus, WorkflowContentWorkItem, WorkflowTask } from "@/features/workflow/types"
import { useWorkflow } from "@/features/workflow/workflow-provider"
import { getTaskDueTimestamp } from "@/features/workflow/task-dates"
import { archiveCompletedTaskAction, trashTaskAction, undoTaskArchiveAction, undoTaskTrashAction } from "@/app/tasks/actions"
import { markScheduledContentPublished } from "@/app/content/actions"
import { cn } from "@/lib/utils"

type TaskView = "kanban" | "list"
type KanbanBoardView = "active" | "closed" | "all"
type SortOption = "due" | "priority" | "client" | "title"

export type TaskFilters = {
  query: string
  client: string
  status: "all" | TaskStatus
  priority: "all" | WorkflowTask["priority"]
  sort: SortOption
}

export function hideContentAlreadyTrackedByTasks(contentItems: WorkflowContentWorkItem[], tasks: WorkflowTask[]) {
  const linkedContentIds = new Set(tasks
    .filter((task) => task.contentItemId && task.status !== "cancelled")
    .map((task) => task.contentItemId!))
  return contentItems.filter((item) => !linkedContentIds.has(item.id))
}

const statuses: TaskStatus[] = ["todo", "in_progress", "for_review", "revision_requested", "approved", "completed", "cancelled"]
const priorities: WorkflowTask["priority"][] = ["urgent", "high", "medium", "low"]
const priorityRank: Record<WorkflowTask["priority"], number> = { urgent: 0, high: 1, medium: 2, low: 3 }

const boardColumns: Array<{ id: string; label: string; statuses: TaskStatus[]; accent: string }> = [
  { id: "todo", label: "To do", statuses: ["todo"], accent: "bg-muted-foreground" },
  { id: "in_progress", label: "In progress", statuses: ["in_progress"], accent: "bg-primary" },
  { id: "for_review", label: "For review", statuses: ["for_review"], accent: "bg-accent" },
  { id: "revision_requested", label: "Revision", statuses: ["revision_requested"], accent: "bg-[#9a6242]" },
  { id: "approved", label: "Approved", statuses: ["approved"], accent: "bg-emerald-600" },
  { id: "completed", label: "Completed", statuses: ["completed"], accent: "bg-emerald-700" },
  { id: "cancelled", label: "Cancelled", statuses: ["cancelled"], accent: "bg-muted-foreground" },
]

const sortLabels: Record<SortOption, string> = {
  due: "Due date",
  priority: "Priority",
  client: "Client",
  title: "Task name",
}

const trashUndoDurationMs = 8_000

function canMoveTaskToTrash(task: WorkflowTask, actor: DemoUser) {
  const canManage = actor.role === "supervisor" || task.primaryOwner.id === actor.id || task.createdById === actor.id
  return canManage && ["todo", "in_progress", "cancelled", "completed"].includes(task.status)
}

function canArchiveTask(task: WorkflowTask, actor: DemoUser) {
  const canManage = actor.role === "supervisor" || task.primaryOwner.id === actor.id || task.createdById === actor.id
  return canManage && task.status === "completed"
}

type TaskTrashNotice = { taskId: string; title: string; error?: string }
type TaskArchiveNotice = { taskId: string; title: string; error?: string }

export function filterAndSortTasks(tasks: WorkflowTask[], filters: TaskFilters) {
  const query = filters.query.trim().toLowerCase()

  return tasks
    .filter((task) => !query || [task.title, task.clientName, task.campaign, task.contentItem].some((value) => value.toLowerCase().includes(query)))
    .filter((task) => filters.client === "all" || task.clientId === filters.client)
    .filter((task) => filters.status === "all" || task.status === filters.status)
    .filter((task) => filters.priority === "all" || task.priority === filters.priority)
    .toSorted((a, b) => {
      if (filters.sort === "priority") return priorityRank[a.priority] - priorityRank[b.priority]
      if (filters.sort === "client") return a.clientName.localeCompare(b.clientName)
      if (filters.sort === "title") return a.title.localeCompare(b.title)
      return getTaskDueTimestamp(a) - getTaskDueTimestamp(b) || parseDueDate(a.dueDate) - parseDueDate(b.dueDate)
    })
}

function parseDueDate(value: string) {
  const parsed = Date.parse(value.replace(" · ", " "))
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed
}

export function TaskList() {
  const { tasks, contentWorkItems, updateStatus, currentUser, demoMode } = useWorkflow()
  const { openTask } = useTaskDrawer()
  const router = useRouter()
  const [view, setView] = useState<TaskView>("kanban")
  const [filters, setFilters] = useState<TaskFilters>({ query: "", client: "all", status: "all", priority: "all", sort: "due" })
  const [trashNotice, setTrashNotice] = useState<TaskTrashNotice | null>(null)
  const [trashPending, setTrashPending] = useState(false)
  const [archiveNotice, setArchiveNotice] = useState<TaskArchiveNotice | null>(null)
  const [archivePending, setArchivePending] = useState(false)
  const [reviewContent, setReviewContent] = useState<WorkflowContentWorkItem | null>(null)
  const [publishingContentId, setPublishingContentId] = useState<string | null>(null)
  const [contentNotice, setContentNotice] = useState<{ message: string; error?: boolean } | null>(null)

  useEffect(() => {
    if (!trashNotice || trashPending) return
    const timeout = window.setTimeout(() => setTrashNotice(null), trashUndoDurationMs)
    return () => window.clearTimeout(timeout)
  }, [trashNotice, trashPending])

  useEffect(() => {
    if (!archiveNotice || archivePending) return
    const timeout = window.setTimeout(() => setArchiveNotice(null), trashUndoDurationMs)
    return () => window.clearTimeout(timeout)
  }, [archiveNotice, archivePending])

  const myTasks = useMemo(() => currentUser.role === "supervisor" ? tasks : tasks.filter((task) => task.primaryOwner.id === currentUser.id), [tasks, currentUser.id, currentUser.role])
  // This list is already scoped by Supabase RLS to the user's accessible clients.
  // assigned_to identifies the creator/editor, not the account manager for a client.
  const myContent = useMemo(() => hideContentAlreadyTrackedByTasks(contentWorkItems, myTasks), [contentWorkItems, myTasks])
  const clients = useMemo(() => Array.from(new Map([
    ...myTasks.map((task) => [task.clientId, task.clientName] as const),
    ...myContent.map((item) => [item.clientId, item.clientName] as const),
  ]).entries()).map(([id, name]) => ({ id, name })), [myTasks, myContent])
  const visibleTasks = useMemo(() => filterAndSortTasks(myTasks, filters), [myTasks, filters])
  const visibleContent = useMemo(() => myContent.filter((item) => {
    const matchesClient = filters.client === "all" || item.clientId === filters.client
    const searchText = `${item.title} ${item.clientName} ${item.campaignName} ${item.platform} ${item.format} ${item.assigneeName ?? ""}`.toLocaleLowerCase()
    const matchesSearch = !filters.query || searchText.includes(filters.query.trim().toLocaleLowerCase())
    return matchesClient && matchesSearch
  }), [myContent, filters.client, filters.query])
  const activeFilterCount = [filters.client !== "all", filters.status !== "all", filters.priority !== "all", Boolean(filters.query)].filter(Boolean).length

  function resetFilters() {
    setFilters({ query: "", client: "all", status: "all", priority: "all", sort: "due" })
  }

  function moveTask(taskId: string, status: TaskStatus) {
    if (status === "cancelled" && !window.confirm("Cancel this task? Its files and review history will be kept.")) return
    void updateStatus(taskId, status)
  }

  async function markContentPublished(item: WorkflowContentWorkItem) {
    if (demoMode || publishingContentId) return
    setPublishingContentId(item.id)
    setContentNotice(null)
    try {
      const result = await markScheduledContentPublished(item.id)
      if (!result.ok) {
        setContentNotice({ message: result.error, error: true })
        return
      }
      setContentNotice({ message: `${item.title} marked as published.` })
      router.refresh()
    } catch {
      setContentNotice({ message: "Could not update this content. Please try again.", error: true })
    } finally {
      setPublishingContentId(null)
    }
  }

  async function moveTaskToTrash(task: WorkflowTask) {
    if (demoMode || trashPending) return
    setTrashPending(true)
    try {
      const result = await trashTaskAction(task.id)
      if (result.error) {
        setTrashNotice({
          taskId: task.id,
          title: task.title,
          error: result.error.includes("work history or files")
            ? "The database still blocks tasks with files or history. Apply migration 202610240001_allow_task_trash_with_history.sql in Supabase, then try again."
            : result.error.includes("review or approval")
            ? "Resolve its review first; only To do, In progress, Cancelled, or Completed tasks can go to Trash."
            : "Could not move this task to Trash. Check your access and try again.",
        })
        return
      }
      setTrashNotice({ taskId: task.id, title: task.title })
      router.refresh()
    } catch {
      setTrashNotice({ taskId: task.id, title: task.title, error: "Could not reach the server. The task was not moved to Trash." })
    } finally {
      setTrashPending(false)
    }
  }

  async function undoTaskTrash() {
    if (!trashNotice || trashNotice.error || trashPending) return
    setTrashPending(true)
    try {
      const result = await undoTaskTrashAction(trashNotice.taskId)
      if (result.error) {
        setTrashNotice({ ...trashNotice, error: "Undo failed. The task is still in Trash and can be restored from the Trash page." })
        return
      }
      setTrashNotice(null)
      router.refresh()
    } catch {
      setTrashNotice({ ...trashNotice, error: "Could not reach the server. The task remains in Trash and can be restored there." })
    } finally {
      setTrashPending(false)
    }
  }

  async function archiveTask(task: WorkflowTask) {
    if (demoMode || archivePending) return
    setArchivePending(true)
    setArchiveNotice(null)
    try {
      const result = await archiveCompletedTaskAction(task.id)
      if (result.error) {
        setArchiveNotice({ taskId: task.id, title: task.title, error: result.error.includes("completed")
          ? "Only completed tasks can be archived."
          : "Could not archive this task. Check your access and try again." })
        return
      }
      setArchiveNotice({ taskId: task.id, title: task.title })
      router.refresh()
    } catch {
      setArchiveNotice({ taskId: task.id, title: task.title, error: "Could not reach the server. The task was not archived." })
    } finally {
      setArchivePending(false)
    }
  }

  async function undoTaskArchive() {
    if (!archiveNotice || archiveNotice.error || archivePending) return
    setArchivePending(true)
    try {
      const result = await undoTaskArchiveAction(archiveNotice.taskId)
      if (result.error) {
        setArchiveNotice({ ...archiveNotice, error: "Undo failed. Restore the task from Task archive." })
        return
      }
      setArchiveNotice(null)
      router.refresh()
    } catch {
      setArchiveNotice({ ...archiveNotice, error: "Could not reach the server. Restore the task from Task archive." })
    } finally {
      setArchivePending(false)
    }
  }

  return (
    <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{currentUser.role === "supervisor" ? "Supervision" : "My work"}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">{currentUser.role === "supervisor" ? "Team work" : "My work"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Calendar content and separate assignments, together.</p>
        </div>
        <div className="flex w-fit rounded-xl border border-primary/18 bg-background/65 p-1 shadow-sm" aria-label="Task view">
          <button onClick={() => setView("kanban")} aria-pressed={view === "kanban"} className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition", view === "kanban" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Columns3 className="size-3.5" /> Kanban</button>
          <button onClick={() => setView("list")} aria-pressed={view === "list"} className={cn("flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition", view === "list" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><LayoutList className="size-3.5" /> List</button>
        </div>
      </div>

      <section className="glass-panel mt-5 rounded-2xl border p-3 sm:p-4" aria-label="Task filters">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1 xl:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
            <input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Search tasks, clients, campaigns..." aria-label="Search tasks" className="h-9 w-full rounded-xl border border-primary/20 bg-background/72 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/10" />
          </label>

          <div className="flex flex-wrap gap-2">
            <FilterMenu label="Client" value={filters.client === "all" ? "All clients" : clients.find((client) => client.id === filters.client)?.name ?? "All clients"} active={filters.client !== "all"}>
              <FilterItem selected={filters.client === "all"} onSelect={() => setFilters((current) => ({ ...current, client: "all" }))}>All clients</FilterItem>
              {clients.map((client) => <FilterItem key={client.id} selected={filters.client === client.id} onSelect={() => setFilters((current) => ({ ...current, client: client.id }))}>{client.name}</FilterItem>)}
            </FilterMenu>

            <FilterMenu label="Status" value={filters.status === "all" ? "All statuses" : getStatusLabel(filters.status)} active={filters.status !== "all"}>
              <FilterItem selected={filters.status === "all"} onSelect={() => setFilters((current) => ({ ...current, status: "all" }))}>All statuses</FilterItem>
              {statuses.map((status) => <FilterItem key={status} selected={filters.status === status} onSelect={() => setFilters((current) => ({ ...current, status }))}>{getStatusLabel(status)}</FilterItem>)}
            </FilterMenu>

            <FilterMenu label="Priority" value={filters.priority === "all" ? "All priorities" : capitalize(filters.priority)} active={filters.priority !== "all"}>
              <FilterItem selected={filters.priority === "all"} onSelect={() => setFilters((current) => ({ ...current, priority: "all" }))}>All priorities</FilterItem>
              {priorities.map((priority) => <FilterItem key={priority} selected={filters.priority === priority} onSelect={() => setFilters((current) => ({ ...current, priority }))}>{capitalize(priority)}</FilterItem>)}
            </FilterMenu>

            <FilterMenu label="Sort" value={sortLabels[filters.sort]} icon={ArrowDownAZ}>
              {(Object.keys(sortLabels) as SortOption[]).map((sort) => <FilterItem key={sort} selected={filters.sort === sort} onSelect={() => setFilters((current) => ({ ...current, sort }))}>{sortLabels[sort]}</FilterItem>)}
            </FilterMenu>

            {activeFilterCount > 0 && <Button variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground"><RotateCcw data-icon="inline-start" /> Clear <Badge className="ml-1 bg-primary/12 text-primary">{activeFilterCount}</Badge></Button>}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-primary/10 pt-3 text-xs text-muted-foreground"><span>{visibleTasks.length} of {myTasks.length} tasks</span><span className="hidden items-center gap-1 sm:flex"><SlidersHorizontal className="size-3.5" /> Search/client filter both sections; status/priority filter tasks</span></div>
      </section>

      <section className="glass-panel mt-4 rounded-2xl border p-2.5 sm:p-3" aria-labelledby="content-work-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="content-work-heading" className="text-sm font-semibold">{currentUser.role === "supervisor" ? "Team calendar content" : "My calendar content"}</h2>
          <Link className="text-[11px] font-medium text-primary underline-offset-4 hover:underline" href="/content">Open tracker <ArrowUpRight className="ml-0.5 inline size-3" /></Link>
        </div>
        {contentNotice && <p role={contentNotice.error ? "alert" : "status"} className={cn("mt-2 rounded-lg border px-2.5 py-1.5 text-[11px]", contentNotice.error ? "border-destructive/25 bg-destructive/5 text-destructive" : "border-primary/20 bg-primary/5 text-foreground")}>{contentNotice.message}</p>}
        {!visibleContent.length ? <p className="mt-2 rounded-lg border border-dashed border-primary/18 px-3 py-4 text-center text-[11px] text-muted-foreground">{myContent.length ? "No calendar content matches these filters." : "No calendar content yet."}</p> : <div className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {visibleContent.map((item) => <CalendarContentCard key={item.id} item={item} demoMode={demoMode} publishing={publishingContentId === item.id} onReview={() => setReviewContent(item)} onPublish={() => void markContentPublished(item)} />)}
        </div>}
      </section>

      <Sheet open={Boolean(reviewContent)} onOpenChange={(open) => { if (!open) setReviewContent(null) }}>
        <SheetContent className="w-[calc(100%-20px)] gap-0 overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle>Submit content for review</SheetTitle>
            <SheetDescription>{reviewContent ? `${reviewContent.title} · choose or upload the files the supervisor should review.` : "Choose the files for supervisor review."}</SheetDescription>
          </SheetHeader>
          {reviewContent && <div className="px-4 pb-5"><ClientFiles clientId={reviewContent.clientId} contentItemId={reviewContent.id} canUpload={!demoMode} compact /></div>}
        </SheetContent>
      </Sheet>

      {view === "kanban" ? <KanbanBoard tasks={visibleTasks} onMove={moveTask} onOpen={openTask} onTrash={moveTaskToTrash} onArchive={archiveTask} trashPending={trashPending} archivePending={archivePending} actor={currentUser} demoMode={demoMode} /> : <ListView tasks={visibleTasks} onMove={moveTask} onOpen={openTask} onTrash={moveTaskToTrash} onArchive={archiveTask} trashPending={trashPending} archivePending={archivePending} actor={currentUser} demoMode={demoMode} />}
      {trashNotice && <div role={trashNotice.error ? "alert" : "status"} aria-live="polite" className="fixed bottom-5 right-5 z-[100] flex max-w-[min(92vw,420px)] items-center gap-3 rounded-xl border border-primary/20 bg-popover/95 px-4 py-3 text-sm shadow-2xl backdrop-blur-xl">
        <Trash2 className={cn("size-4 shrink-0", trashNotice.error ? "text-destructive" : "text-primary")} />
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{trashNotice.error ?? `“${trashNotice.title}” moved to Trash.`}</p>{!trashNotice.error && <p className="mt-0.5 text-[10px] text-muted-foreground">Undo available for 8 seconds. Task history is preserved.</p>}</div>
        {!trashNotice.error && <button type="button" disabled={trashPending} onClick={() => void undoTaskTrash()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-50"><Undo2 className="size-3.5" />{trashPending ? "Working…" : "Undo"}</button>}
      </div>}
      {archiveNotice && <div role={archiveNotice.error ? "alert" : "status"} aria-live="polite" className="fixed bottom-5 right-5 z-[100] flex max-w-[min(92vw,420px)] items-center gap-3 rounded-xl border border-primary/20 bg-popover/95 px-4 py-3 text-sm shadow-2xl backdrop-blur-xl">
        <Archive className={cn("size-4 shrink-0", archiveNotice.error ? "text-destructive" : "text-primary")} />
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{archiveNotice.error ?? `“${archiveNotice.title}” moved to Task archive.`}</p>{!archiveNotice.error && <p className="mt-0.5 text-[10px] text-muted-foreground">Undo available for 8 seconds. Files and review history are preserved.</p>}</div>
        {!archiveNotice.error && <button type="button" disabled={archivePending} onClick={() => void undoTaskArchive()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-50"><Undo2 className="size-3.5" />{archivePending ? "Working…" : "Undo"}</button>}
      </div>}
    </main>
  )
}

function CalendarContentCard({ item, demoMode, publishing, onReview, onPublish }: { item: WorkflowContentWorkItem; demoMode: boolean; publishing: boolean; onReview: () => void; onPublish: () => void }) {
  const { openNewTask } = useTaskDrawer()
  const canAddTask = !["published", "cancelled", "rejected"].includes(item.status)
  const canSubmitForReview = !demoMode && !["for_review", "published", "cancelled", "rejected"].includes(item.status)

  return <article className="group min-w-0 rounded-xl border border-primary/15 bg-background/75 p-2.5 transition hover:border-primary/35 hover:bg-background">
    <div className="flex items-start justify-between gap-2">
      <Link href={`/content#content-item-${encodeURIComponent(item.id)}`} className="min-w-0 truncate text-[13px] font-semibold leading-5 hover:text-primary hover:underline">
        {item.title}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${item.title}`} className="-mr-1 -mt-1 size-7 shrink-0 rounded-full text-muted-foreground hover:bg-secondary/50 hover:text-foreground" />}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={5} className="min-w-48 rounded-xl border border-primary/16 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
          {canAddTask && <DropdownMenuItem onClick={() => openNewTask({ contentItemId: item.id, contentItemTitle: item.title, title: `Create assets: ${item.title}`, clientId: item.clientId, clientName: item.clientName, campaignName: item.campaignName, deadlineAt: item.deadlineAt })} className="min-h-8 rounded-lg px-2 text-xs"><ListPlus className="size-3.5" />Add as task</DropdownMenuItem>}
          {canAddTask && (canSubmitForReview || item.status === "for_review" || item.status === "scheduled") && <DropdownMenuSeparator />}
          {canSubmitForReview && <DropdownMenuItem onClick={onReview} className="min-h-8 rounded-lg px-2 text-xs"><Send className="size-3.5" />Submit files for review</DropdownMenuItem>}
          {item.status === "for_review" && !demoMode && <DropdownMenuItem onClick={onReview} className="min-h-8 rounded-lg px-2 text-xs"><Send className="size-3.5" />View review files</DropdownMenuItem>}
          {item.status === "scheduled" && !demoMode && <DropdownMenuItem disabled={publishing} onClick={onPublish} className="min-h-8 rounded-lg px-2 text-xs"><CheckCircle2 className="size-3.5" />{publishing ? <><LoaderCircle className="size-3.5 animate-spin" />Updating…</> : "Mark as published"}</DropdownMenuItem>}
          {!canAddTask && !canSubmitForReview && item.status !== "for_review" && item.status !== "scheduled" && <DropdownMenuItem disabled className="min-h-8 rounded-lg px-2 text-xs text-muted-foreground">No available actions</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <p className="truncate text-[10px] leading-4 text-muted-foreground">{item.clientName} · {item.platform} · {item.format}</p>
    <p className="mt-1 truncate text-[10px] leading-4 text-muted-foreground">{contentStatusLabel(item.status)}{item.assigneeName ? ` · ${item.assigneeName}` : ""}</p>
    <p className="truncate text-[10px] leading-4 text-muted-foreground">{item.deadlineAt ? `Due ${formatContentDate(item.deadlineAt)}` : "No deadline"}{item.publishAt ? ` · Post ${formatContentDate(item.publishAt)}` : " · Unscheduled"}</p>
  </article>
}

function contentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    idea: "Idea", planned: "Planned", in_production: "In progress", for_review: "In review",
    revision_requested: "Changes requested", waiting_client: "Waiting for client", scheduled: "Scheduled",
    published: "Published", rejected: "Rejected", cancelled: "Cancelled",
  }
  return labels[status] ?? status.replaceAll("_", " ")
}

function formatContentDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
  if (Number.isNaN(date.getTime())) return "Date not set"
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date)
}

function FilterMenu({ label, value, active = false, icon: Icon = ChevronDown, children }: { label: string; value: string; active?: boolean; icon?: typeof ChevronDown; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="lg" className={cn("justify-between gap-2 border-primary/18 bg-background/70", active && "border-primary/45 bg-secondary/22 text-foreground")} />}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="max-w-28 truncate text-xs">{value}</span>
        <Icon className="size-3.5 text-primary transition-transform group-aria-expanded/button:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={7} className="min-w-48 rounded-xl border border-primary/16 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FilterItem({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return <DropdownMenuItem onClick={onSelect} className="min-h-8 rounded-lg px-2 text-xs"><span className="grid size-4 place-items-center">{selected && <Check className="size-3.5 text-primary" />}</span><span className="flex-1">{children}</span></DropdownMenuItem>
}

function KanbanBoard({ tasks, onMove, onOpen, onTrash, onArchive, trashPending, archivePending, actor, demoMode }: { tasks: WorkflowTask[]; onMove: (taskId: string, status: TaskStatus) => void; onOpen: (taskId: string) => void; onTrash: (task: WorkflowTask) => void; onArchive: (task: WorkflowTask) => void; trashPending: boolean; archivePending: boolean; actor: DemoUser; demoMode: boolean }) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null)
  const [boardView, setBoardView] = useState<KanbanBoardView>("active")
  const displayedColumns = boardColumns.filter((column) => {
    const isClosed = column.statuses.every((status) => status === "completed" || status === "cancelled")
    return boardView === "all" || (boardView === "closed" ? isClosed : !isClosed)
  })
  const closedCount = tasks.filter((task) => task.status === "completed" || task.status === "cancelled").length
  const activeCount = tasks.length - closedCount

  return (
    <section className="mt-5 overflow-x-auto pb-3" aria-label="Kanban board">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-muted-foreground">Drag tasks only between statuses your role can change. Closed tasks stay saved in history.</p>
        <div className="flex rounded-lg border border-primary/16 bg-background/65 p-0.5" aria-label="Kanban task group">
          {([
            ["active", "Active", activeCount],
            ["closed", "Closed", closedCount],
            ["all", "All", tasks.length],
          ] as const).map(([view, label, count]) => <button key={view} type="button" onClick={() => setBoardView(view)} aria-pressed={boardView === view} className={cn("flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold transition", boardView === view ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {label}<span className={cn("rounded-full px-1.5 py-0.5 text-[9px]", boardView === view ? "bg-primary-foreground/15" : "bg-muted")}>{count}</span>
          </button>)}
        </div>
      </div>
      <div className={cn("grid gap-3", boardView === "all" ? "min-w-[1480px] grid-cols-7" : boardView === "closed" ? "min-w-[480px] grid-cols-2" : "min-w-[1080px] grid-cols-5")}>
        {displayedColumns.map((column) => {
          const columnTasks = tasks.filter((task) => column.statuses.includes(task.status))
          const targetStatus = column.statuses[0]
          const canDrop = tasks.some((task) => taskStatusOptions(task, actor).includes(targetStatus))
          return (
            <div key={column.id}
              onDragOver={(event) => { if (!canDrop) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(targetStatus) }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null) }}
              onDrop={(event) => {
                event.preventDefault()
                const taskId = event.dataTransfer.getData("text/plain")
                const task = tasks.find((item) => item.id === taskId)
                if (task && taskStatusOptions(task, actor).includes(targetStatus)) onMove(taskId, targetStatus)
                setDraggingTaskId(null)
                setDropTarget(null)
              }}
              className={cn("glass-panel flex h-[min(70vh,720px)] min-h-[430px] flex-col rounded-2xl border p-3 transition-colors", dropTarget === targetStatus && canDrop && "border-primary/50 bg-primary/5")}
            >
              <div className="flex shrink-0 items-center justify-between px-1 pb-3"><div className="flex items-center gap-2"><span className={cn("size-2 rounded-full", column.accent)} /><h2 className="text-xs font-bold uppercase tracking-wider">{column.label}</h2></div><Badge variant="outline" className="bg-background/65 text-[10px]">{columnTasks.length}</Badge></div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">{columnTasks.map((task, index) => <KanbanCard key={task.id} task={task} onOpen={onOpen} onMove={onMove} onTrash={onTrash} onArchive={onArchive} trashPending={trashPending} archivePending={archivePending} actor={actor} demoMode={demoMode} delayMs={Math.min(index, 5) * 45} dragging={draggingTaskId === task.id} onDragStart={() => setDraggingTaskId(task.id)} onDragEnd={() => { setDraggingTaskId(null); setDropTarget(null) }} />)}{columnTasks.length === 0 && <div className={cn("grid min-h-28 place-items-center rounded-xl border border-dashed border-primary/18 bg-background/28 px-3 text-center text-xs text-muted-foreground", dropTarget === targetStatus && "border-primary/45 bg-primary/5 text-primary")}>{canDrop ? "Drop an eligible task here" : "No matching tasks"}</div>}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function KanbanCard({ task, onOpen, onMove, onTrash, onArchive, trashPending, archivePending, actor, demoMode, delayMs, dragging, onDragStart, onDragEnd }: { task: WorkflowTask; onOpen: (taskId: string) => void; onMove: (taskId: string, status: TaskStatus) => void; onTrash: (task: WorkflowTask) => void; onArchive: (task: WorkflowTask) => void; trashPending: boolean; archivePending: boolean; actor: DemoUser; demoMode: boolean; delayMs: number; dragging: boolean; onDragStart: () => void; onDragEnd: () => void }) {
  const canMove = taskStatusOptions(task, actor).length > 0
  return (
    <article draggable={canMove} onDragStart={(event) => { if (!canMove) { event.preventDefault(); return }; event.dataTransfer.setData("text/plain", task.id); event.dataTransfer.effectAllowed = "move"; onDragStart() }} onDragEnd={onDragEnd} title={canMove ? "Drag to a status you are allowed to change" : "Status is controlled by the review workflow"} className={cn("sticky-note rounded-xl border p-3.5", canMove && "cursor-grab active:cursor-grabbing", dragging && "opacity-45")} style={{ animationDelay: `${delayMs}ms` }}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <PriorityBadge priority={task.priority} />
        <KanbanCardActions task={task} onOpen={onOpen} onMove={onMove} onTrash={onTrash} onArchive={onArchive} trashPending={trashPending} archivePending={archivePending} actor={actor} demoMode={demoMode} />
      </div>
      <button
        type="button"
        draggable={false}
        onClick={() => onOpen(task.id)}
        aria-label={`Open details for ${task.title}`}
        className="sticky-note__open group block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="mt-3 block text-sm font-semibold leading-5 group-hover:text-primary">{task.title}</span>
        <span className="mt-1.5 line-clamp-2 block text-[11px] leading-5 text-muted-foreground">{task.contentItem}</span>
        <span className="mt-4 block border-t border-primary/15 pt-3"><span className="block truncate text-[11px] font-medium">{task.clientName}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{task.campaign}</span></span>
        <span className="mt-3 flex items-center justify-between gap-1"><span className="flex min-w-0 items-center gap-1 truncate text-[10px] text-muted-foreground"><CalendarDays className="size-3 shrink-0" />{task.dueDate.split(" · ")[0]}</span><span className="flex shrink-0 items-center gap-2"><span className="inline-flex items-center gap-0.5 rounded-full bg-primary/12 px-1.5 py-1 text-[9px] font-semibold text-primary">Open <ArrowUpRight className="size-3" /></span><span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary/50 text-[8px] font-bold">{task.primaryOwner.initials}</span></span></span>
      </button>
      {task.contentItemId && <Link href={`/content#content-item-${encodeURIComponent(task.contentItemId)}`} onClick={(event) => event.stopPropagation()} className="mt-2 inline-flex text-[10px] font-semibold text-primary hover:underline">Open linked content <ArrowUpRight className="ml-1 size-3" /></Link>}
    </article>
  )
}

function KanbanCardActions({ task, onOpen, onMove, onTrash, onArchive, trashPending, archivePending, actor, demoMode }: { task: WorkflowTask; onOpen: (taskId: string) => void; onMove: (taskId: string, status: TaskStatus) => void; onTrash: (task: WorkflowTask) => void; onArchive: (task: WorkflowTask) => void; trashPending: boolean; archivePending: boolean; actor: DemoUser; demoMode: boolean }) {
  const moves = taskStatusOptions(task, actor)
  const canTrash = !demoMode && canMoveTaskToTrash(task, actor)
  const canArchive = !demoMode && canArchiveTask(task, actor)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" draggable={false} aria-label={`Task actions for ${task.title}`} className="-mr-1 -mt-1 size-7 rounded-full text-muted-foreground hover:bg-background/80 hover:text-foreground" />}>
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={5} className="min-w-44 rounded-xl border border-primary/16 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
        <DropdownMenuLabel className="px-2 py-1 text-[10px]">Task actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onOpen(task.id)} className="min-h-8 rounded-lg px-2 text-xs">Open task details</DropdownMenuItem>
        {moves.length > 0 && <DropdownMenuSeparator />}
        {moves.map((status) => <DropdownMenuItem key={status} onClick={() => onMove(task.id, status)} className={cn("min-h-8 rounded-lg px-2 text-xs", status === "cancelled" && "text-destructive focus:text-destructive")}>
          {status === "in_progress" ? "Start work" : status === "todo" ? "Move to To do" : status === "cancelled" ? "Cancel task" : getStatusLabel(status)}
        </DropdownMenuItem>)}
        {canArchive && <><DropdownMenuSeparator /><DropdownMenuItem disabled={archivePending} onClick={() => onArchive(task)} className="min-h-8 rounded-lg px-2 text-xs"><Archive className="size-3.5" />{archivePending ? "Archiving…" : "Move to archive"}</DropdownMenuItem></>}
        {canTrash && <><DropdownMenuSeparator /><DropdownMenuItem disabled={trashPending} onClick={() => onTrash(task)} className="min-h-8 rounded-lg px-2 text-xs text-destructive focus:text-destructive"><Trash2 className="size-3.5" />{trashPending ? "Moving…" : "Move to Trash"}</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ListView({ tasks, onMove, onOpen, onTrash, onArchive, trashPending, archivePending, actor, demoMode }: { tasks: WorkflowTask[]; onMove: (taskId: string, status: TaskStatus) => void; onOpen: (taskId: string) => void; onTrash: (task: WorkflowTask) => void; onArchive: (task: WorkflowTask) => void; trashPending: boolean; archivePending: boolean; actor: DemoUser; demoMode: boolean }) {
  return (
    <section className="glass-panel mt-5 overflow-hidden rounded-2xl border" aria-label="Task list">
      <div className="hidden grid-cols-[minmax(280px,1fr)_160px_120px_140px_44px] border-b px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground md:grid"><span>Task</span><span>Client</span><span>Due</span><span>Status</span><span /></div>
      {tasks.length === 0 && <div className="grid min-h-52 place-items-center p-6 text-center"><div><CircleDot className="mx-auto size-6 text-primary" /><p className="mt-3 text-sm font-semibold">No matching tasks</p><p className="mt-1 text-xs text-muted-foreground">Change or clear the current filters.</p></div></div>}
      {tasks.map((task, index) => (
        <article key={task.id} className={cn("grid gap-3 border-b px-5 py-4 transition hover:brightness-[.985] md:grid-cols-[minmax(280px,1fr)_160px_120px_140px_44px] md:items-center", index % 2 ? "bg-[#ead5b9] dark:bg-[#33291f]" : "bg-[#fff9f1] dark:bg-[#241f19]")}>
          <div className="min-w-0"><div className="flex items-center gap-2"><PriorityBadge priority={task.priority} /><button type="button" onClick={() => onOpen(task.id)} className="truncate text-left text-sm font-semibold hover:text-primary hover:underline">{task.title}</button></div><p className="mt-1 truncate text-xs text-muted-foreground">{task.campaign} · {task.contentItem}</p>{task.contentItemId && <Link href={`/content#content-item-${encodeURIComponent(task.contentItemId)}`} className="mt-1 inline-flex text-[10px] font-semibold text-primary hover:underline">Open linked content <ArrowUpRight className="ml-1 size-3" /></Link>}</div>
          <div className="flex items-center gap-2 text-xs"><Avatar className="size-6"><AvatarFallback className="bg-secondary/40 text-[8px]">{task.clientName.split(" ").map((word) => word[0]).join("").slice(0, 2)}</AvatarFallback></Avatar><span className="truncate">{task.clientName}</span></div>
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{task.dueDate.split(" · ")[0]}</span>
          <StatusBadge status={task.status} className="w-fit" />
          <TaskStatusMenu task={task} onMove={onMove} onTrash={onTrash} onArchive={onArchive} trashPending={trashPending} archivePending={archivePending} actor={actor} demoMode={demoMode} />
        </article>
      ))}
    </section>
  )
}

function TaskStatusMenu({ task, onMove, onTrash, onArchive, trashPending, archivePending, actor, demoMode }: { task: WorkflowTask; onMove: (taskId: string, status: TaskStatus) => void; onTrash: (task: WorkflowTask) => void; onArchive: (task: WorkflowTask) => void; trashPending: boolean; archivePending: boolean; actor: DemoUser; demoMode: boolean }) {
  const moves = taskStatusOptions(task, actor)
  const canTrash = !demoMode && canMoveTaskToTrash(task, actor)
  const canArchive = !demoMode && canArchiveTask(task, actor)
  if (moves.length === 0 && !canTrash && !canArchive) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Move ${task.title}`} />}><MoreHorizontal /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44 rounded-xl border border-primary/16 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
        {moves.map((status) => <DropdownMenuItem key={status} onClick={() => onMove(task.id, status)} className="min-h-8 rounded-lg px-2 text-xs">{status === "in_progress" ? "Start work" : status === "completed" ? "Mark completed" : status === "cancelled" ? "Cancel task" : "Move to do"}</DropdownMenuItem>)}
        {canArchive && <><DropdownMenuSeparator /><DropdownMenuItem disabled={archivePending} onClick={() => onArchive(task)} className="min-h-8 rounded-lg px-2 text-xs"><Archive className="size-3.5" />{archivePending ? "Archiving…" : "Move to archive"}</DropdownMenuItem></>}
        {canTrash && <><DropdownMenuSeparator /><DropdownMenuItem disabled={trashPending} onClick={() => onTrash(task)} className="min-h-8 rounded-lg px-2 text-xs text-destructive focus:text-destructive"><Trash2 className="size-3.5" />{trashPending ? "Moving…" : "Move to Trash"}</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PriorityBadge({ priority }: { priority: WorkflowTask["priority"] }) {
  return <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider", priority === "urgent" ? "bg-[#9a6242]/14 text-[#7f5136] dark:text-secondary" : priority === "high" ? "bg-primary/14 text-primary" : "bg-secondary/30 text-muted-foreground")}>{priority}</span>
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
