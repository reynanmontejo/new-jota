"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  ArrowDownAZ,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDot,
  Columns3,
  LayoutList,
  MoreHorizontal,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusBadge, getStatusLabel } from "@/features/workflow/status-badge"
import type { TaskStatus, WorkflowTask } from "@/features/workflow/types"
import { useWorkflow } from "@/features/workflow/workflow-provider"
import { cn } from "@/lib/utils"

type TaskView = "kanban" | "list"
type SortOption = "due" | "priority" | "client" | "title"

export type TaskFilters = {
  query: string
  client: string
  status: "all" | TaskStatus
  priority: "all" | WorkflowTask["priority"]
  sort: SortOption
}

const statuses: TaskStatus[] = ["todo", "in_progress", "for_review", "revision_requested", "approved", "completed"]
const priorities: WorkflowTask["priority"][] = ["urgent", "high", "medium", "low"]
const priorityRank: Record<WorkflowTask["priority"], number> = { urgent: 0, high: 1, medium: 2, low: 3 }

const boardColumns: Array<{ id: string; label: string; statuses: TaskStatus[]; accent: string }> = [
  { id: "todo", label: "To do", statuses: ["todo"], accent: "bg-muted-foreground" },
  { id: "in_progress", label: "In progress", statuses: ["in_progress"], accent: "bg-primary" },
  { id: "for_review", label: "For review", statuses: ["for_review"], accent: "bg-accent" },
  { id: "revision_requested", label: "Revision", statuses: ["revision_requested"], accent: "bg-[#9a6242]" },
  { id: "done", label: "Done", statuses: ["approved", "completed"], accent: "bg-emerald-600" },
]

const sortLabels: Record<SortOption, string> = {
  due: "Due date",
  priority: "Priority",
  client: "Client",
  title: "Task name",
}

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
      return parseDueDate(a.dueDate) - parseDueDate(b.dueDate)
    })
}

function parseDueDate(value: string) {
  const parsed = Date.parse(value.replace(" · ", " "))
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed
}

export function TaskList() {
  const { tasks, updateStatus } = useWorkflow()
  const [view, setView] = useState<TaskView>("kanban")
  const [filters, setFilters] = useState<TaskFilters>({ query: "", client: "all", status: "all", priority: "all", sort: "due" })

  const clients = useMemo(() => Array.from(new Map(tasks.map((task) => [task.clientId, task.clientName])).entries()).map(([id, name]) => ({ id, name })), [tasks])
  const visibleTasks = useMemo(() => filterAndSortTasks(tasks, filters), [tasks, filters])
  const activeFilterCount = [filters.client !== "all", filters.status !== "all", filters.priority !== "all", Boolean(filters.query)].filter(Boolean).length

  function resetFilters() {
    setFilters({ query: "", client: "all", status: "all", priority: "all", sort: "due" })
  }

  return (
    <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">My work</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">My tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">Plan and track assignments across every client.</p>
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
        <div className="mt-3 flex items-center justify-between border-t border-primary/10 pt-3 text-xs text-muted-foreground"><span>{visibleTasks.length} of {tasks.length} tasks</span><span className="hidden items-center gap-1 sm:flex"><SlidersHorizontal className="size-3.5" /> Filters update both views</span></div>
      </section>

      {view === "kanban" ? <KanbanBoard tasks={visibleTasks} onMove={updateStatus} /> : <ListView tasks={visibleTasks} onMove={updateStatus} />}
    </main>
  )
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

function KanbanBoard({ tasks, onMove }: { tasks: WorkflowTask[]; onMove: (taskId: string, status: TaskStatus) => void }) {
  return (
    <section className="mt-5 overflow-x-auto pb-3" aria-label="Kanban board">
      <div className="grid min-w-[1180px] grid-cols-5 gap-3">
        {boardColumns.map((column) => {
          const columnTasks = tasks.filter((task) => column.statuses.includes(task.status))
          return (
            <div key={column.id} className="glass-panel min-h-[430px] rounded-2xl border p-3">
              <div className="flex items-center justify-between px-1 pb-3"><div className="flex items-center gap-2"><span className={cn("size-2 rounded-full", column.accent)} /><h2 className="text-xs font-bold uppercase tracking-wider">{column.label}</h2></div><Badge variant="outline" className="bg-background/65 text-[10px]">{columnTasks.length}</Badge></div>
              <div className="space-y-3">{columnTasks.map((task) => <KanbanCard key={task.id} task={task} onMove={onMove} />)}{columnTasks.length === 0 && <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-primary/18 bg-background/28 px-3 text-center text-xs text-muted-foreground">No matching tasks</div>}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function KanbanCard({ task, onMove }: { task: WorkflowTask; onMove: (taskId: string, status: TaskStatus) => void }) {
  return (
    <article className="iso-tile rounded-xl border border-background/80 p-3.5">
      <div className="flex items-start justify-between gap-2"><PriorityBadge priority={task.priority} /><TaskStatusMenu task={task} onMove={onMove} /></div>
      <Link href={`/tasks/${task.id}`} className="mt-3 block text-sm font-semibold leading-5 hover:text-primary hover:underline">{task.title}</Link>
      <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{task.contentItem}</p>
      <div className="mt-4 border-t border-primary/10 pt-3"><p className="truncate text-[11px] font-medium">{task.clientName}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{task.campaign}</p></div>
      <div className="mt-3 flex items-center justify-between"><span className="flex items-center gap-1 text-[10px] text-muted-foreground"><CalendarDays className="size-3" />{task.dueDate.split(" · ")[0]}</span><Avatar className="size-6"><AvatarFallback className="bg-secondary/40 text-[8px] font-bold">{task.primaryOwner.initials}</AvatarFallback></Avatar></div>
    </article>
  )
}

function ListView({ tasks, onMove }: { tasks: WorkflowTask[]; onMove: (taskId: string, status: TaskStatus) => void }) {
  return (
    <section className="glass-panel mt-5 overflow-hidden rounded-2xl border" aria-label="Task list">
      <div className="hidden grid-cols-[minmax(280px,1fr)_160px_120px_140px_44px] border-b px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground md:grid"><span>Task</span><span>Client</span><span>Due</span><span>Status</span><span /></div>
      {tasks.length === 0 && <div className="grid min-h-52 place-items-center p-6 text-center"><div><CircleDot className="mx-auto size-6 text-primary" /><p className="mt-3 text-sm font-semibold">No matching tasks</p><p className="mt-1 text-xs text-muted-foreground">Change or clear the current filters.</p></div></div>}
      {tasks.map((task, index) => (
        <article key={task.id} className={cn("grid gap-3 border-b px-5 py-4 transition hover:brightness-[.985] md:grid-cols-[minmax(280px,1fr)_160px_120px_140px_44px] md:items-center", index % 2 ? "bg-[#ead5b9] dark:bg-[#33291f]" : "bg-[#fff9f1] dark:bg-[#241f19]")}>
          <div className="min-w-0"><div className="flex items-center gap-2"><PriorityBadge priority={task.priority} /><Link href={`/tasks/${task.id}`} className="truncate text-sm font-semibold hover:text-primary hover:underline">{task.title}</Link></div><p className="mt-1 truncate text-xs text-muted-foreground">{task.campaign} · {task.contentItem}</p></div>
          <div className="flex items-center gap-2 text-xs"><Avatar className="size-6"><AvatarFallback className="bg-secondary/40 text-[8px]">{task.clientName.split(" ").map((word) => word[0]).join("").slice(0, 2)}</AvatarFallback></Avatar><span className="truncate">{task.clientName}</span></div>
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{task.dueDate.split(" · ")[0]}</span>
          <StatusBadge status={task.status} className="w-fit" />
          <TaskStatusMenu task={task} onMove={onMove} />
        </article>
      ))}
    </section>
  )
}

function TaskStatusMenu({ task, onMove }: { task: WorkflowTask; onMove: (taskId: string, status: TaskStatus) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Move ${task.title}`} />}><MoreHorizontal /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44 rounded-xl border border-primary/16 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
        <DropdownMenuLabel>Move task to</DropdownMenuLabel><DropdownMenuSeparator />
        {boardColumns.map((column) => {
          const status = column.statuses[0]
          const selected = column.statuses.includes(task.status)
          return <DropdownMenuItem key={column.id} onClick={() => onMove(task.id, status)} className="min-h-8 rounded-lg px-2 text-xs"><span className={cn("size-2 rounded-full", column.accent)} /><span className="flex-1">{column.label}</span>{selected && <Check className="size-3.5 text-primary" />}</DropdownMenuItem>
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-8 rounded-lg px-2 text-xs" onClick={() => onMove(task.id, "cancelled")}><span className="flex-1 text-muted-foreground">Cancel task</span></DropdownMenuItem>
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
