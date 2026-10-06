"use client"

import {
  CalendarDays,
  MoreHorizontal,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { DashboardShell } from "@/components/layout/dashboard-shell"
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
import { Progress } from "@/components/ui/progress"
import { useTaskDrawer } from "@/features/tasks/task-drawer"
import { getStatusLabel } from "@/features/workflow/status-badge"
import { getTaskDueTimestamp, isTaskDueOnDate, taskDueLabel } from "@/features/workflow/task-dates"
import { canEditTask, taskStatusOptions } from "@/features/workflow/task-permissions"
import type { TaskStatus, WorkflowTask } from "@/features/workflow/types"
import { useWorkflow } from "@/features/workflow/workflow-provider"

const upcoming = [
  { day: "28", month: "SEP", title: "Founder story reel", clientId: "harbor-and-pine", client: "Harbor & Pine", type: "Instagram" },
  { day: "30", month: "SEP", title: "Cold brew carousel", clientId: "northwind-coffee", client: "Northwind Coffee", type: "LinkedIn" },
  { day: "02", month: "OCT", title: "Product spotlight", clientId: "luma-skincare", client: "Luma Skincare", type: "Facebook" },
]

const clients = [
  { id: "luma-skincare", initials: "LS", name: "Luma Skincare", color: "bg-secondary/50 text-[#604726]" },
  { id: "northwind-coffee", initials: "NC", name: "Northwind Coffee", color: "bg-accent/35 text-[#654a28]" },
  { id: "harbor-and-pine", initials: "HP", name: "Harbor & Pine", color: "bg-primary/20 text-[#604726]" },
]

type DashboardMetric = { label: string; value: string; detail: string }

function MetricCard({ metric }: { metric: DashboardMetric }) {
  return (
    <article className="overview-panel flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <p className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">{metric.label}</p>
        <p className="shrink-0 text-lg font-semibold leading-none tracking-tight text-foreground">
          {metric.value}
        </p>
      </div>
      <p className="sr-only max-w-20 text-right text-[10px] font-medium leading-tight text-primary sm:not-sr-only">
        {metric.detail}
      </p>
    </article>
  )
}

function priorityDot(priority: WorkflowTask["priority"]) {
  if (priority === "urgent") return "bg-accent"
  if (priority === "high") return "bg-primary"
  if (priority === "medium") return "bg-secondary"
  return "bg-muted-foreground"
}

function FocusTaskMenu({
  task,
  onMove,
  onOpen,
  actor,
}: {
  task: WorkflowTask
  onMove: (taskId: string, status: TaskStatus) => void
  onOpen: (taskId: string) => void
  actor: ReturnType<typeof useWorkflow>["currentUser"]
}) {
  const moves = taskStatusOptions(task, actor)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="rounded-md opacity-60 group-hover:opacity-100"
            aria-label={`More options for ${task.title}`}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40 rounded-lg p-1.5">
        <DropdownMenuLabel>Task actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onOpen(task.id)} className="min-h-8 rounded-md px-2 text-xs">
          View details
        </DropdownMenuItem>
        {canEditTask(task, actor.id) && <DropdownMenuSeparator />}
        {moves.map((status) => (
          <DropdownMenuItem
            key={status}
            onClick={() => onMove(task.id, status)}
            className="min-h-8 rounded-md px-2 text-xs"
          >
            {status === "in_progress" ? "Start work" : status === "completed" ? "Mark completed" : "Move to do"}
          </DropdownMenuItem>
        ))}
        {moves.some((status) => status === "todo" || status === "in_progress") && <DropdownMenuItem onClick={() => onOpen(task.id)} className="min-h-8 rounded-md px-2 text-xs">Open submission</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function Home() {
  const { tasks, clients: workspaceClients, upcomingContent, updateStatus, currentUser, demoMode } = useWorkflow()
  const { openTask } = useTaskDrawer()
  const [taskScope, setTaskScope] = useState<"mine" | "all">("all")
  const visibleFocusTasks = currentUser.role === "supervisor" && taskScope === "all"
    ? tasks
    : tasks.filter((task) => task.primaryOwner.id === currentUser.id)
  const accessibleTasks = currentUser.role === "supervisor" ? tasks : tasks.filter((task) => task.primaryOwner.id === currentUser.id)
  const accessibleClientIds = new Set(accessibleTasks.map((task) => task.clientId))
  const visibleClients = demoMode
    ? currentUser.role === "supervisor" ? clients : clients.filter((client) => accessibleClientIds.has(client.id))
    : workspaceClients.map((client, index) => ({
      ...client,
      initials: client.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      color: ["bg-secondary/50 text-[#604726]", "bg-accent/35 text-[#654a28]", "bg-primary/20 text-[#604726]"][index % 3],
    }))
  const visibleUpcoming = demoMode
    ? (currentUser.role === "supervisor" ? upcoming : upcoming.filter((item) => accessibleClientIds.has(item.clientId))).map((item) => ({ id: item.title, title: item.title, day: item.day, month: item.month, client: item.client, type: item.type }))
    : upcomingContent.map((item) => {
      const date = new Date(item.publishAt)
      return { id: item.id, title: item.title, day: new Intl.DateTimeFormat("en-US", { day: "2-digit" }).format(date), month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase(), client: item.clientName, type: item.platform }
    })
  const priorityOrder: Record<WorkflowTask["priority"], number> = { urgent: 0, high: 1, medium: 2, low: 3 }
  const focusTasks = [...visibleFocusTasks]
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || getTaskDueTimestamp(a) - getTaskDueTimestamp(b))
    .slice(0, 4)
  const dueToday = visibleFocusTasks.filter((task) => isTaskDueOnDate(task, new Date()))
  const remainingTasks = visibleFocusTasks.filter((task) => !["completed", "cancelled"].includes(task.status))
  const reviewTasks = visibleFocusTasks.filter((task) => task.status === "for_review")
  const revisionTasks = visibleFocusTasks.filter((task) => task.status === "revision_requested")
  const completedTasks = visibleFocusTasks.filter((task) => task.status === "completed").length
  const progress = visibleFocusTasks.length ? Math.round((completedTasks / visibleFocusTasks.length) * 100) : 0
  const latestRevisionTask = revisionTasks[0]
  const metrics: DashboardMetric[] = [
    { label: "Due today", value: String(dueToday.length), detail: `${dueToday.filter((task) => task.priority === "high" || task.priority === "urgent").length} high priority` },
    { label: "Remaining", value: String(remainingTasks.length), detail: `Across ${new Set(remainingTasks.map((task) => task.clientId)).size} clients` },
    { label: "In review", value: String(reviewTasks.length), detail: "Awaiting supervisor" },
    { label: "Changes requested", value: String(revisionTasks.length), detail: revisionTasks.length ? "Needs your attention" : "No revisions pending" },
  ]

  return (
    <DashboardShell compact>
        <main className="mx-auto max-w-[1480px] px-4 py-3 sm:px-6 lg:px-7 lg:py-3.5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span>Workspace</span>
                <span aria-hidden="true">›</span>
                <span className="text-foreground">Dashboard</span>
              </div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-[22px]">Good morning, {currentUser.name.split(" ")[0]}</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">Here’s what needs your attention today.</p>
            </div>
            <div className="overview-panel flex h-8 items-center gap-2 self-start rounded-lg border px-2.5 text-xs text-muted-foreground sm:self-auto">
              <CalendarDays className="size-3.5 text-primary" />
              <span>{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</span>
            </div>
          </div>

          <section aria-label="Task summary" className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
            {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
          </section>

          <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(0,1.72fr)_minmax(270px,0.68fr)]">
            <div className="space-y-3">
              <section id="tasks" className="overview-panel overflow-hidden rounded-lg border">
                <div className="flex flex-col gap-2 border-b bg-secondary/15 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">Today’s focus</h2>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{focusTasks.length} tasks ordered by urgency and due time</p>
                  </div>
                  {currentUser.role === "supervisor" && <div className="flex items-center gap-0.5 rounded-md bg-secondary/20 p-0.5 text-[10px] font-medium">
                    <button
                      aria-pressed={taskScope === "mine"}
                      className={`h-6 rounded-[5px] px-2 transition ${taskScope === "mine" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => setTaskScope("mine")}
                      type="button"
                    >
                      My tasks
                    </button>
                    <button
                      aria-pressed={taskScope === "all"}
                      className={`h-6 rounded-[5px] px-2 transition ${taskScope === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                      onClick={() => setTaskScope("all")}
                      type="button"
                    >
                      All
                    </button>
                  </div>}
                </div>
                <div className="divide-y">
                  {focusTasks.map((task, index) => (
                    <article
                      key={task.id}
                      className={`group grid grid-cols-[auto_minmax(0,1fr)] gap-2 px-3 py-2.5 transition hover:brightness-[0.985] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center ${
                        index % 2 === 0
                          ? "bg-background/55 dark:bg-[#241f19]"
                          : "bg-secondary/18 dark:bg-[#33291f]"
                      }`}
                    >
                      <span aria-hidden="true" className="mt-0.5 size-4 rounded-full border border-border bg-background/65 sm:mt-0" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`size-1.5 shrink-0 rounded-full ${priorityDot(task.priority)}`} />
                          <h3 className="truncate text-xs font-semibold"><button type="button" onClick={() => openTask(task.id)} className="text-left hover:text-primary hover:underline">{task.title}</button></h3>
                          {task.status === "revision_requested" && <Badge className="h-4 rounded-[5px] border-primary/25 bg-primary/10 px-1.5 text-[9px] text-[#6b4d2e] dark:text-secondary">Revision</Badge>}
                        </div>
                        <p className="mt-0.5 truncate pl-3.5 text-[10px] text-muted-foreground">
                          {task.clientName} <span className="px-1 text-border">•</span> {task.campaign}
                        </p>
                      </div>
                      <div className="col-start-2 flex items-center justify-between gap-2 sm:col-start-auto sm:justify-end">
                        <span className={`min-w-14 text-right text-[10px] font-medium ${task.priority === "urgent" ? "text-[#7f5136] dark:text-secondary" : task.priority === "high" ? "text-primary" : "text-muted-foreground"}`}>
                          {taskDueLabel(task)}
                        </span>
                        <Badge variant="outline" className="hidden h-5 min-w-20 justify-center rounded-[5px] bg-background px-1.5 text-[9px] font-medium text-muted-foreground md:inline-flex">
                          {getStatusLabel(task.status)}
                        </Badge>
                        <FocusTaskMenu task={task} onMove={updateStatus} onOpen={openTask} actor={currentUser} />
                      </div>
                    </article>
                  ))}
                </div>
                <div className="border-t bg-muted/15 px-3 py-2 text-right">
                  <Link href="/tasks" className="text-[10px] font-semibold text-primary hover:underline">
                    View all my tasks
                  </Link>
                </div>
              </section>

              <section className="overview-panel rounded-lg border p-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">Upcoming content</h2>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Next scheduled publish dates</p>
                  </div>
                  <Link
                    href="/calendar"
                    className="inline-flex h-6 items-center rounded-md px-2 text-[10px] font-medium text-primary hover:bg-secondary/20"
                  >
                    View calendar
                  </Link>
                </div>
                <div className="mt-2.5 grid gap-2 md:grid-cols-3">
                  {visibleUpcoming.length ? visibleUpcoming.map((item) => (
                    <article key={item.id ?? item.title} className="rounded-lg border bg-background/65 p-2.5 transition hover:border-primary/45">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 shrink-0 rounded-md bg-secondary/35 py-1.5 text-center text-[#654a28]">
                          <span className="block text-[8px] font-semibold tracking-wider">{item.month}</span>
                          <span className="block text-sm font-semibold leading-3.5">{item.day}</span>
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-[11px] font-semibold">{item.title}</h3>
                          <p className="mt-0.5 truncate text-[9px] text-muted-foreground">{item.client} · {item.type}</p>
                        </div>
                      </div>
                    </article>
                  )) : <p className="col-span-full rounded-md border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">No upcoming content is scheduled.</p>}
                </div>
              </section>
            </div>

            <aside className="space-y-3">
              <section className="overview-panel rounded-lg border p-3">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Task progress</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight">{completedTasks} of {visibleFocusTasks.length}</p>
                </div>
                <Progress value={progress} className="mt-2.5 h-1 bg-secondary/22 [&_[data-slot=progress-indicator]]:bg-primary" />
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <span className="font-medium text-primary">{progress}% completed</span>
                  <span className="text-muted-foreground">{remainingTasks.length} remaining</span>
                </div>
              </section>

              <section id="clients" className="overview-panel rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">My clients</h2>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{visibleClients.length} active accounts</p>
                  </div>
                  <Link href="/clients" className="inline-flex h-7 items-center rounded-md px-2 text-[10px] font-medium text-primary hover:bg-secondary/20">
                    View more
                  </Link>
                </div>
                <div className="mt-2 divide-y">
                  {visibleClients.length ? visibleClients.map((client) => (
                    <Link key={client.id} href={`/clients/${client.id}`} className="flex min-h-10 w-full items-center gap-2 py-1.5 text-left transition hover:bg-muted/45">
                      <Avatar className="size-7 rounded-md">
                        <AvatarFallback className={`rounded-md text-[9px] font-semibold ${client.color}`}>{client.initials}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold">{client.name}</span>
                        <span className="block text-[9px] text-muted-foreground">{visibleFocusTasks.filter((task) => task.clientId === client.id && !["completed", "cancelled"].includes(task.status)).length} open tasks</span>
                      </span>
                      <span aria-hidden="true" className="text-xs text-muted-foreground">›</span>
                    </Link>
                  )) : <p className="py-4 text-xs text-muted-foreground">No client accounts are available yet.</p>}
                </div>
              </section>

              {latestRevisionTask && <section className="overflow-hidden rounded-lg border border-primary/30 bg-secondary/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">Review update</p>
                <p className="mt-2 text-xs font-semibold leading-4 text-foreground">Revisions were requested on “{latestRevisionTask.title}”.</p>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{latestRevisionTask.clientName} · {latestRevisionTask.versions.at(-1)?.reviewedBy ?? "Supervisor"}</p>
                <button type="button" onClick={() => openTask(latestRevisionTask.id)} className="mt-2.5 inline-block text-[10px] font-semibold text-primary hover:underline">
                  View submission
                </button>
              </section>}
            </aside>
          </div>
        </main>
    </DashboardShell>
  )
}
