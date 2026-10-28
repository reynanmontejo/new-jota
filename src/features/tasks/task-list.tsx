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
  Columns3,
  LoaderCircle,
  ListPlus,
  LayoutList,
  MoreHorizontal,
  RotateCcw,
  Search,
  Send,
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
  owner: string
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
const myContentPreviewLimit = 3
const teamContentPreviewLimit = 3

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
  const visible: WorkflowTask[] = []

  for (const task of tasks) {
    if (filters.client !== "all" && task.clientId !== filters.client) continue
    if (filters.owner !== "all" && task.primaryOwner.id !== filters.owner) continue
    if (filters.status !== "all" && task.status !== filters.status) continue
    if (filters.priority !== "all" && task.priority !== filters.priority) continue
    if (query && !task.title.toLowerCase().includes(query) && !task.clientName.toLowerCase().includes(query)
      && !task.campaign.toLowerCase().includes(query) && !task.contentItem.toLowerCase().includes(query)) continue
    visible.push(task)
  }

  return visible.toSorted((a, b) => {
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
  const { tasks, contentWorkItems, clients: workflowClients, updateStatus, currentUser, demoMode } = useWorkflow()
  const contentPreviewLimit = currentUser.role === "supervisor" ? teamContentPreviewLimit : myContentPreviewLimit
  const { openTask } = useTaskDrawer()
  const router = useRouter()
  const [view, setView] = useState<TaskView>("kanban")
  const [filters, setFilters] = useState<TaskFilters>({ query: "", client: "all", owner: "all", status: "all", priority: "all", sort: "due" })
  const [trashNotice, setTrashNotice] = useState<TaskTrashNotice | null>(null)
  const [trashPending, setTrashPending] = useState(false)
  const [archiveNotice, setArchiveNotice] = useState<TaskArchiveNotice | null>(null)
  const [archivePending, setArchivePending] = useState(false)
  const [reviewContent, setReviewContent] = useState<WorkflowContentWorkItem | null>(null)
  const [publishingContentId, setPublishingContentId] = useState<string | null>(null)
  const [contentNotice, setContentNotice] = useState<{ message: string; error?: boolean } | null>(null)
  const [showAllContent, setShowAllContent] = useState(false)

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

  const myTasks = useMemo(() => currentUser.role === "supervisor" ? tasks : tasks.filter((task) => task.primaryOwner.id === currentUser.id || task.createdById === currentUser.id), [tasks, currentUser.id, currentUser.role])
  // This list is already scoped by Supabase RLS to the user's accessible clients.
  // assigned_to identifies the creator/editor, not the account manager for a client.
  const myContent = useMemo(() => hideContentAlreadyTrackedByTasks(contentWorkItems, myTasks), [contentWorkItems, myTasks])
  const clients = useMemo(() => Array.from(new Map([
    ...myTasks.map((task) => [task.clientId, task.clientName] as const),
    ...myContent.map((item) => [item.clientId, item.clientName] as const),
  ]).entries()).map(([id, name]) => ({ id, name })), [myTasks, myContent])
  const users = useMemo(() => Array.from(new Map([
    ...workflowClients.flatMap((client) => (client.members ?? []).map((member) => [member.id, member.name] as const)),
    ...myTasks.map((task) => [task.primaryOwner.id, task.primaryOwner.name] as const),
    ...myContent.flatMap((item) => item.assigneeId && item.assigneeName ? [[item.assigneeId, item.assigneeName] as const] : []),
  ]).entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), [workflowClients, myTasks, myContent])
  const visibleTasks = useMemo(() => filterAndSortTasks(myTasks, filters), [myTasks, filters])
  const visibleContent = useMemo(() => myContent.filter((item) => {
    const matchesClient = filters.client === "all" || item.clientId === filters.client
    const searchText = `${item.title} ${item.clientName} ${item.campaignName} ${item.platform} ${item.format} ${item.assigneeName ?? ""}`.toLocaleLowerCase()
    const matchesSearch = !filters.query || searchText.includes(filters.query.trim().toLocaleLowerCase())
    const matchesOwner = filters.owner === "all" || item.assigneeId === filters.owner
    return matchesClient && matchesSearch && matchesOwner
  }), [myContent, filters.client, filters.owner, filters.query])
  const previewContent = showAllContent ? visibleContent : visibleContent.slice(0, contentPreviewLimit)
  const activeFilterCount = [filters.client !== "all", filters.owner !== "all", filters.status !== "all", filters.priority !== "all", Boolean(filters.query)].filter(Boolean).length

  function resetFilters() {
    setFilters({ query: "", client: "all", owner: "all", status: "all", priority: "all", sort: "due" })
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
    <main className="mx-auto max-w-[1480px] px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{currentUser.role === "supervisor" ? "Team work" : "My work"}</h1>
        </div>
        <div className="flex w-fit rounded-xl border border-primary/18 bg-background/65 p-0.5 shadow-sm" aria-label="Task view">
          <button onClick={() => setView("kanban")} aria-pressed={view === "kanban"} className={cn("flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition", view === "kanban" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Columns3 className="size-3" /> Kanban</button>
          <button onClick={() => setView("list")} aria-pressed={view === "list"} className={cn("flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition", view === "list" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><LayoutList className="size-3" /> Table</button>
        </div>
      </div>

      <section className="glass-panel mt-3 rounded-xl border p-2.5" aria-labelledby="content-work-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 id="content-work-heading" className="text-xs font-semibold">{currentUser.role === "supervisor" ? "Team content" : "My content"}</h2>
            <span className="text-[10px] text-muted-foreground">{visibleContent.length} items</span>
            {visibleContent.length > contentPreviewLimit && <Button type="button" variant="ghost" size="sm" aria-expanded={showAllContent} onClick={() => setShowAllContent((expanded) => !expanded)} className="h-6 px-1.5 text-[10px] text-primary">
              {showAllContent ? "Show less" : `View all ${visibleContent.length}`}
              <ChevronDown className={cn("ml-0.5 size-3 transition-transform", showAllContent && "rotate-180")} />
            </Button>}
          </div>
          <Link className="text-[10px] font-medium text-primary underline-offset-4 hover:underline" href="/content">Open tracker <ArrowUpRight className="ml-0.5 inline size-3" /></Link>
        </div>
        {contentNotice && <p role={contentNotice.error ? "alert" : "status"} className={cn("mt-1.5 rounded-lg border px-2 py-1 text-[10px]", contentNotice.error ? "border-destructive/25 bg-destructive/5 text-destructive" : "border-primary/20 bg-primary/5 text-foreground")}>{contentNotice.message}</p>}
        {!visibleContent.length ? <p className="mt-1.5 rounded-lg border border-dashed border-primary/18 px-3 py-2.5 text-center text-[10px] text-muted-foreground">{myContent.length ? "No content matches these filters." : "No calendar content yet."}</p> : <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {previewContent.map((item) => <CalendarContentCard key={item.id} item={item} demoMode={demoMode} showAssignee={currentUser.role === "supervisor" || item.assigneeName !== currentUser.name} publishing={publishingContentId === item.id} onReview={() => setReviewContent(item)} onPublish={() => void markContentPublished(item)} />)}
        </div>}
      </section>

      <div className="mt-4 flex items-center gap-2">
        <h2 className="text-sm font-semibold">Tasks</h2>
        <span className="text-[10px] text-muted-foreground">{visibleTasks.length} {visibleTasks.length === 1 ? "task" : "tasks"}</span>
      </div>
      <section className="glass-panel mt-2 rounded-xl border p-2.5 sm:p-3" aria-label="Task filters">
        <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1 xl:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-primary" />
            <input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Search tasks, clients, campaigns..." aria-label="Search tasks" className="h-8 w-full rounded-lg border border-primary/20 bg-background/72 pl-8 pr-2.5 text-xs outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/10" />
          </label>

          <div className="flex flex-wrap gap-2">
            <FilterMenu label="Client" value={filters.client === "all" ? "All clients" : clients.find((client) => client.id === filters.client)?.name ?? "All clients"} active={filters.client !== "all"}>
              <FilterItem selected={filters.client === "all"} onSelect={() => setFilters((current) => ({ ...current, client: "all" }))}>All clients</FilterItem>
              {clients.map((client) => <FilterItem key={client.id} selected={filters.client === client.id} onSelect={() => setFilters((current) => ({ ...current, client: client.id }))}>{client.name}</FilterItem>)}
            </FilterMenu>

            {currentUser.role === "supervisor" && <FilterMenu label="User" value={filters.owner === "all" ? "All users" : users.find((user) => user.id === filters.owner)?.name ?? "All users"} active={filters.owner !== "all"}>
              <FilterItem selected={filters.owner === "all"} onSelect={() => setFilters((current) => ({ ...current, owner: "all" }))}>All users</FilterItem>
              {users.map((user) => <FilterItem key={user.id} selected={filters.owner === user.id} onSelect={() => setFilters((current) => ({ ...current, owner: user.id }))}>{user.name}</FilterItem>)}
            </FilterMenu>}

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
        <div className="mt-2 flex items-center justify-between border-t border-primary/10 pt-2 text-[11px] text-muted-foreground"><span>{visibleTasks.length} of {myTasks.length} tasks</span>{activeFilterCount > 0 && <span>{activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active</span>}</div>
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

function CalendarContentCard({ item, demoMode, showAssignee, publishing, onReview, onPublish }: { item: WorkflowContentWorkItem; demoMode: boolean; showAssignee: boolean; publishing: boolean; onReview: () => void; onPublish: () => void }) {
  const { openNewTask } = useTaskDrawer()
  const canAddTask = !["published", "cancelled", "rejected"].includes(item.status)
  const canSubmitForReview = !demoMode && !["for_review", "published", "cancelled", "rejected"].includes(item.status)
  const categoryColor = item.category === "video"
    ? "border-violet-300/70 bg-violet-50/60 hover:bg-violet-50/85 dark:border-violet-800/70 dark:bg-violet-950/25 dark:hover:bg-violet-950/40"
    : item.category === "static"
      ? "border-emerald-300/70 bg-emerald-50/60 hover:bg-emerald-50/85 dark:border-emerald-800/70 dark:bg-emerald-950/25 dark:hover:bg-emerald-950/40"
      : "border-primary/15 bg-background/75 hover:border-primary/35 hover:bg-background"

  return <article className={`group w-full min-w-0 rounded-lg border px-2 py-1.5 transition ${categoryColor}`}>
    <div className="flex items-center justify-between gap-1.5">
      <Link href={`/content#content-item-${encodeURIComponent(item.id)}`} className="min-w-0 truncate text-[11px] font-semibold leading-4 hover:text-primary hover:underline">
        {item.title}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${item.title}`} className="-mr-1 size-6 shrink-0 rounded-full text-muted-foreground hover:bg-secondary/50 hover:text-foreground" />}>
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={5} className="min-w-48 rounded-xl border border-primary/16 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
          {canAddTask && <DropdownMenuItem onClick={() => openNewTask({ contentItemId: item.id, contentItemTitle: item.title, title: `Create assets: ${item.title}`, clientId: item.clientId, clientName: item.clientName, campaignName: item.campaignName, deadlineAt: item.deadlineAt, assigneeId: item.assigneeId, contentCategory: item.category, contentType: item.format, contentDescription: item.description, videoEditorId: item.videoEditorId })} className="min-h-8 rounded-lg px-2 text-xs"><ListPlus className="size-3.5" />Add as task</DropdownMenuItem>}
          {canAddTask && (canSubmitForReview || item.status === "for_review" || item.status === "scheduled") && <DropdownMenuSeparator />}
          {canSubmitForReview && <DropdownMenuItem onClick={onReview} className="min-h-8 rounded-lg px-2 text-xs"><Send className="size-3.5" />Submit files for review</DropdownMenuItem>}
          {item.status === "for_review" && !demoMode && <DropdownMenuItem onClick={onReview} className="min-h-8 rounded-lg px-2 text-xs"><Send className="size-3.5" />View review files</DropdownMenuItem>}
          {item.status === "scheduled" && !demoMode && <DropdownMenuItem disabled={publishing} onClick={onPublish} className="min-h-8 rounded-lg px-2 text-xs"><CheckCircle2 className="size-3.5" />{publishing ? <><LoaderCircle className="size-3.5 animate-spin" />Updating…</> : "Mark as published"}</DropdownMenuItem>}
          {!canAddTask && !canSubmitForReview && item.status !== "for_review" && item.status !== "scheduled" && <DropdownMenuItem disabled className="min-h-8 rounded-lg px-2 text-xs text-muted-foreground">No available actions</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <p className="truncate text-[9px] leading-3.5 text-muted-foreground">{item.clientName} · {item.platform}{item.format ? ` · ${item.format}` : ""}</p>
    <div className="flex min-w-0 items-center justify-between gap-2 text-[9px] leading-3.5 text-muted-foreground">
      <span className="min-w-0 truncate">{contentStatusLabel(item.status)}{showAssignee && item.assigneeName ? ` · ${item.assigneeName}` : ""}</span>
      {(item.deadlineAt || item.publishAt) && <span className="shrink-0">{item.deadlineAt ? `Due ${formatCompactContentDate(item.deadlineAt)}` : ""}{item.deadlineAt && item.publishAt ? " · " : ""}{item.publishAt ? `Post ${formatCompactContentDate(item.publishAt)}` : ""}</span>}
    </div>
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

function formatCompactContentDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
  if (Number.isNaN(date.getTime())) return "Date not set"
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date)
}

function FilterMenu({ label, value, active = false, icon: Icon = ChevronDown, children }: { label: string; value: string; active?: boolean; icon?: typeof ChevronDown; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label={`Filter ${label}: ${value}`} className={cn("h-7 justify-between gap-1.5 border-primary/18 bg-background/70 px-2", active && "border-primary/45 bg-secondary/22 text-foreground")} />}>
        <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="max-w-24 truncate text-[11px]">{value}</span>
        <Icon className="size-3 text-primary transition-transform group-aria-expanded/button:rotate-180" />
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
    <section className="kanban-board-scroll mt-4 overflow-x-auto pb-2" aria-label="Kanban board">
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
              className={cn("glass-panel flex max-h-[min(62vh,600px)] min-h-[max(260px,min(55vh,480px))] flex-col rounded-xl border p-2.5 transition-colors", dropTarget === targetStatus && canDrop && "border-primary/50 bg-primary/5")}
            >
              <div className="flex shrink-0 items-center justify-between px-1 pb-2"><div className="flex items-center gap-2"><span className={cn("size-2 rounded-full", column.accent)} /><h2 className="text-[11px] font-bold uppercase tracking-wide">{column.label}</h2></div><Badge variant="outline" className="h-5 bg-background/65 px-1.5 text-[9px]">{columnTasks.length}</Badge></div>
              <div className="kanban-column-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-0.5 pr-1.5">{columnTasks.map((task, index) => <KanbanCard key={task.id} task={task} onOpen={onOpen} onMove={onMove} onTrash={onTrash} onArchive={onArchive} trashPending={trashPending} archivePending={archivePending} actor={actor} demoMode={demoMode} delayMs={Math.min(index, 5) * 45} dragging={draggingTaskId === task.id} onDragStart={() => setDraggingTaskId(task.id)} onDragEnd={() => { setDraggingTaskId(null); setDropTarget(null) }} />)}{columnTasks.length === 0 && <div className={cn("grid min-h-56 place-items-center rounded-lg border border-dashed border-primary/18 bg-background/28 px-2.5 text-center text-[11px] text-muted-foreground", dropTarget === targetStatus && "border-primary/45 bg-primary/5 text-primary")}>{canDrop ? "Drop an eligible task here" : "No matching tasks"}</div>}</div>
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
    <article draggable={canMove} onDragStart={(event) => { if (!canMove) { event.preventDefault(); return }; event.dataTransfer.setData("text/plain", task.id); event.dataTransfer.effectAllowed = "move"; onDragStart() }} onDragEnd={onDragEnd} title={canMove ? "Drag to a status you are allowed to change" : "Status is controlled by the review workflow"} className={cn("sticky-note rounded-lg border p-2.5", canMove && "cursor-grab active:cursor-grabbing", dragging && "opacity-45")} style={{ animationDelay: `${delayMs}ms` }}>
      <div className="mb-1.5 flex items-start justify-between gap-2">
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
        <span className="mt-2 block text-[13px] font-semibold leading-4 group-hover:text-primary">{task.title}</span>
        <span className="mt-1 line-clamp-1 block text-[10px] leading-4 text-muted-foreground">{task.contentItem}</span>
        <span className="mt-2 block border-t border-primary/15 pt-2"><span className="block truncate text-[10px] font-medium">{task.clientName}</span><span className="mt-0.5 block truncate text-[9px] text-muted-foreground">{task.campaign}</span></span>
        <span className="mt-2 flex items-center justify-between gap-1"><span className="flex min-w-0 items-center gap-1 truncate text-[9px] text-muted-foreground"><CalendarDays className="size-3 shrink-0" />{task.dueDate.split(" · ")[0]}</span><span className="flex shrink-0 items-center gap-1.5"><span className="inline-flex items-center gap-0.5 rounded-full bg-primary/12 px-1.5 py-0.5 text-[8px] font-semibold text-primary">Open <ArrowUpRight className="size-2.5" /></span><span className="grid size-5 shrink-0 place-items-center rounded-full bg-secondary/50 text-[8px] font-bold">{task.primaryOwner.initials}</span></span></span>
      </button>
      {task.contentItemId && <Link href={`/content#content-item-${encodeURIComponent(task.contentItemId)}`} onClick={(event) => event.stopPropagation()} className="mt-1.5 inline-flex text-[9px] font-semibold text-primary hover:underline">Open linked content <ArrowUpRight className="ml-1 size-3" /></Link>}
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
    <section className="glass-panel mt-3 overflow-hidden rounded-xl border" aria-label="Task table">
      <div className="overflow-x-auto">
        <table aria-label="Tasks" className="w-full min-w-[760px] table-fixed text-left">
          <colgroup><col /><col className="w-[17%]" /><col className="w-[17%]" /><col className="w-[13%]" /><col className="w-[16%]" /><col className="w-10" /></colgroup>
          <thead className="border-b border-primary/12 bg-background/35 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
            <tr><th scope="col" className="px-3 py-2 font-bold">Task</th><th scope="col" className="px-2 py-2 font-bold">Client</th><th scope="col" className="px-2 py-2 font-bold">Owner</th><th scope="col" className="px-2 py-2 font-bold">Due</th><th scope="col" className="px-2 py-2 font-bold">Status</th><th scope="col" className="px-2 py-2"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? <tr><td colSpan={6} className="py-8 text-center"><span className="text-xs font-semibold">No matching tasks</span><span className="ml-2 text-[10px] text-muted-foreground">Adjust the filters to see tasks.</span></td></tr> : tasks.map((task) => <tr key={task.id} className="border-b border-primary/10 transition last:border-b-0 hover:bg-primary/[0.035]">
                <td className="px-3 py-2">
                  <div className="flex min-w-0 items-center gap-1.5"><PriorityBadge priority={task.priority} /><button type="button" onClick={() => onOpen(task.id)} className="truncate text-left text-xs font-semibold hover:text-primary hover:underline">{task.title}</button></div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] leading-4 text-muted-foreground"><span className="truncate">{task.campaign} · {task.contentItem}</span>{task.contentItemId && <Link href={`/content#content-item-${encodeURIComponent(task.contentItemId)}`} aria-label="Open linked content" className="shrink-0 text-primary hover:underline"><ArrowUpRight className="size-3" /></Link>}</div>
                </td>
                <td className="px-2 py-2"><span className="block truncate text-[11px]">{task.clientName}</span></td>
                <td className="px-2 py-2"><span className="flex min-w-0 items-center gap-1.5"><Avatar className="size-5 shrink-0"><AvatarFallback className="bg-secondary/40 text-[8px]">{task.primaryOwner.initials}</AvatarFallback></Avatar><span className="truncate text-[11px]">{task.primaryOwner.name}</span></span></td>
                <td className="px-2 py-2"><span className="flex items-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground"><CalendarDays className="size-3 shrink-0" />{task.dueDate.split(" · ")[0]}</span></td>
                <td className="px-2 py-2"><StatusBadge status={task.status} className="max-w-full px-1.5 py-0.5 text-[9px]" /></td>
                <td className="px-1 py-2"><TaskStatusMenu task={task} onMove={onMove} onTrash={onTrash} onArchive={onArchive} trashPending={trashPending} archivePending={archivePending} actor={actor} demoMode={demoMode} /></td>
              </tr>)}
          </tbody>
        </table>
      </div>
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
