"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CalendarClock, CheckCircle2, CircleAlert, ClipboardCheck, ListTodo, Users } from "lucide-react"

import { useTaskDrawer } from "@/features/tasks/task-drawer"
import { filterInsightsContent, getContentCategoryCounts, getContentFormatBreakdown, getPublishedContentTrend, type ContentDateRange, type InsightsContentItem } from "@/features/insights/insights-content"
import { useWorkflow } from "@/features/workflow/workflow-provider"
import { getStatusLabel } from "@/features/workflow/status-badge"
import type { TaskStatus, WorkflowContentWorkItem, WorkflowTask } from "@/features/workflow/types"

type Scope = "team" | "mine"
type CompletionRange = "7" | "30" | "90" | "all"
type TrendGrouping = "daily" | "weekly" | "monthly"

const terminalStatuses = new Set<TaskStatus>(["completed", "cancelled"])
const statusOrder: TaskStatus[] = ["todo", "in_progress", "for_review", "revision_requested", "approved", "completed", "cancelled"]

function asDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function shortDate(value: string | null | undefined) {
  const date = asDate(value)
  return date ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date) : "Date not set"
}

function dayDistance(value: string | null | undefined, today: Date) {
  const date = asDate(value)
  if (!date) return null
  return Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000)
}

export function filterCompletedTasks(tasks: WorkflowTask[], range: CompletionRange, now: Date) {
  const completed = tasks.filter((task) => task.status === "completed")
  if (range === "all") return completed.sort((a, b) => (asDate(b.completedAt)?.getTime() ?? 0) - (asDate(a.completedAt)?.getTime() ?? 0))
  const cutoff = new Date(now.getTime() - Number(range) * 86_400_000)
  return completed.filter((task) => {
    const completedAt = asDate(task.completedAt)
    return completedAt !== null && completedAt >= cutoff && completedAt <= now
  }).sort((a, b) => (asDate(b.completedAt)?.getTime() ?? 0) - (asDate(a.completedAt)?.getTime() ?? 0))
}

export function filterInsightsByUser(tasks: WorkflowTask[], content: WorkflowContentWorkItem[], userId: string) {
  if (userId === "all") return { tasks, content }
  return {
    tasks: tasks.filter((task) => task.primaryOwner.id === userId),
    content: content.filter((item) => item.assigneeId === userId),
  }
}

export function getCompletionTrend(tasks: WorkflowTask[], now: Date, grouping: TrendGrouping = "weekly") {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const intervals = Array.from({ length: grouping === "daily" ? 7 : 6 }, (_, index) => {
    const start = new Date(today)
    if (grouping === "daily") start.setDate(start.getDate() - (6 - index))
    if (grouping === "weekly") {
      const mondayOffset = (today.getDay() + 6) % 7
      start.setDate(start.getDate() - mondayOffset - (5 - index) * 7)
    }
    if (grouping === "monthly") {
      start.setDate(1)
      start.setMonth(start.getMonth() - (5 - index))
    }
    const end = grouping === "monthly" ? new Date(start.getFullYear(), start.getMonth() + 1, 1) : new Date(start)
    if (grouping !== "monthly") end.setDate(end.getDate() + (grouping === "daily" ? 1 : 7))
    const count = tasks.filter((task) => {
      if (task.status !== "completed") return false
      const completedAt = asDate(task.completedAt)
      return completedAt !== null && completedAt >= start && completedAt < end
    }).length
    const label = grouping === "daily"
      ? new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric" }).format(start)
      : grouping === "monthly"
        ? new Intl.DateTimeFormat("en", { month: "short" }).format(start)
        : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(start)
    return { key: `${start.getFullYear()}-${start.getMonth() + 1}-${start.getDate()}`, label, count }
  })
  return intervals
}

export function InsightsDashboard() {
  const { tasks, contentWorkItems, clients, assignableUsers, currentUser, demoMode } = useWorkflow()
  const { openTask } = useTaskDrawer()
  const router = useRouter()
  const isSupervisor = currentUser.role === "supervisor"
  const [scope, setScope] = useState<Scope>("team")
  const [selectedUserId, setSelectedUserId] = useState("all")
  const [completionRange, setCompletionRange] = useState<CompletionRange>("30")
  const [trendGrouping, setTrendGrouping] = useState<TrendGrouping>("weekly")
  const [contentDateRange, setContentDateRange] = useState<ContentDateRange>("all")
  const [selectedClientId, setSelectedClientId] = useState("all")
  const [reportingContent, setReportingContent] = useState<InsightsContentItem[] | null>(null)
  const [reportingError, setReportingError] = useState<string | null>(null)
  const today = new Date()

  useEffect(() => {
    if (demoMode) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch("/api/insights-content", { cache: "no-store", signal: controller.signal })
        const payload = await response.json() as { items?: InsightsContentItem[]; error?: string }
        if (!response.ok || !payload.items) throw new Error(payload.error ?? "Content reporting could not be loaded.")
        setReportingContent(payload.items)
        setReportingError(null)
      } catch (cause) {
        if (controller.signal.aborted) return
        setReportingError(cause instanceof Error ? cause.message : "Content reporting could not be loaded.")
      }
    })()
    return () => controller.abort()
  }, [demoMode])

  const insightUsers = useMemo(() => {
    const users = new Map<string, string>([[currentUser.id, currentUser.name]])
    for (const user of assignableUsers) users.set(user.id, user.name)
    for (const client of clients) for (const member of client.members ?? []) users.set(member.id, member.name)
    for (const task of tasks) users.set(task.primaryOwner.id, task.primaryOwner.name)
    for (const item of contentWorkItems) if (item.assigneeId && item.assigneeName) users.set(item.assigneeId, item.assigneeName)
    return [...users].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [assignableUsers, clients, contentWorkItems, currentUser.id, currentUser.name, tasks])

  const scoped = useMemo(() => {
    if (!isSupervisor || scope === "mine") {
      return {
        tasks: tasks.filter((task) => task.primaryOwner.id === currentUser.id),
        content: contentWorkItems.filter((item) => item.assigneeId === currentUser.id),
      }
    }
    return filterInsightsByUser(tasks, contentWorkItems, selectedUserId)
  }, [contentWorkItems, currentUser.id, isSupervisor, scope, selectedUserId, tasks])

  const activeTasks = scoped.tasks.filter((task) => !terminalStatuses.has(task.status))
  const overdueTasks = activeTasks.filter((task) => {
    const days = dayDistance(task.dueAt, today)
    return days !== null && days < 0
  }).sort((a, b) => (asDate(a.dueAt)?.getTime() ?? Infinity) - (asDate(b.dueAt)?.getTime() ?? Infinity))
  const reviewTasks = activeTasks.filter((task) => task.status === "for_review")
  const completedTasks = scoped.tasks.filter((task) => task.status === "completed")
  const highPriorityDueSoon = activeTasks.filter((task) => {
    const days = dayDistance(task.dueAt, today)
    return (task.priority === "high" || task.priority === "urgent") && days !== null && days >= 0 && days <= 7
  }).sort((a, b) => (asDate(a.dueAt)?.getTime() ?? Infinity) - (asDate(b.dueAt)?.getTime() ?? Infinity))
  const upcomingContent = scoped.content.flatMap((item) => {
    const days = dayDistance(item.deadlineAt ?? item.publishAt, today)
    return days !== null && days >= 0 && days <= 7 ? [{ ...item, days }] : []
  }).sort((a, b) => a.days - b.days)
  const reportOwnerId = isSupervisor && scope === "team" ? selectedUserId : currentUser.id
  const filteredReportingContent = reportingContent ? filterInsightsContent(reportingContent, {
    ownerId: reportOwnerId, clientId: selectedClientId, range: contentDateRange, now: today,
  }) : []
  const statusCounts = statusOrder.map((status) => ({ status, count: scoped.tasks.filter((task) => task.status === status).length }))
  const maxStatusCount = Math.max(1, ...statusCounts.map((entry) => entry.count))
  const completionTrend = getCompletionTrend(scoped.tasks, today, trendGrouping)
  const maxTrendCompletions = Math.max(1, ...completionTrend.map((period) => period.count))
  const filteredCompletedTasks = filterCompletedTasks(scoped.tasks, completionRange, today)

  const workloadByOwner = [...new Map(activeTasks.map((task) => [task.primaryOwner.id, task.primaryOwner.name])).entries()]
    .map(([ownerId, ownerName]) => ({ ownerId, ownerName, count: activeTasks.filter((task) => task.primaryOwner.id === ownerId).length, reviews: reviewTasks.filter((task) => task.primaryOwner.id === ownerId).length }))
    .sort((a, b) => b.count - a.count || a.ownerName.localeCompare(b.ownerName))

  const nextAction = overdueTasks.length
    ? `${overdueTasks.length} task${overdueTasks.length === 1 ? " is" : "s are"} past due. Review the oldest overdue item first.`
    : highPriorityDueSoon.length
      ? `${highPriorityDueSoon.length} high-priority task${highPriorityDueSoon.length === 1 ? " is" : "s are"} due within 7 days.`
      : reviewTasks.length
      ? `${reviewTasks.length} task${reviewTasks.length === 1 ? " is" : "s are"} waiting for review.`
      : upcomingContent.length
        ? `${upcomingContent.length} content deadline${upcomingContent.length === 1 ? " is" : "s are"} coming up this week.`
        : "Work is on track. Keep task statuses and content dates current."

  return (
    <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        </div>
        {isSupervisor && <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border bg-background/70 p-1" aria-label="Insight scope">
          <button type="button" aria-pressed={scope === "team"} onClick={() => setScope("team")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${scope === "team" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Team</button>
          <button type="button" aria-pressed={scope === "mine"} onClick={() => setScope("mine")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${scope === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>My work</button>
          </div>
          {scope === "team" && <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">User
            <select aria-label="Filter insights by user" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="h-8 max-w-48 rounded-md border border-border bg-background px-2 text-xs text-foreground">
              <option value="all">All users</option>{insightUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>}
        </div>}
      </div>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Work metrics">
        <MetricCard label="Active tasks" value={activeTasks.length} detail="Not completed or cancelled" icon={<ListTodo className="size-4" />} />
        <MetricCard label="Overdue" value={overdueTasks.length} detail={overdueTasks.length ? "Needs attention" : "No overdue tasks"} icon={<CircleAlert className="size-4" />} alert={overdueTasks.length > 0} />
        <MetricCard label="Waiting for review" value={reviewTasks.length} detail="Submitted for supervisor review" icon={<ClipboardCheck className="size-4" />} />
        <MetricCard label="Completed" value={completedTasks.length} detail="Tasks marked complete" icon={<CheckCircle2 className="size-4" />} />
      </section>

      <ContentReportingSummary
        items={filteredReportingContent}
        loading={!demoMode && !reportingContent && !reportingError}
        error={reportingError}
        demoMode={demoMode}
        range={contentDateRange}
        onRangeChange={setContentDateRange}
        clientId={selectedClientId}
        onClientChange={setSelectedClientId}
        clients={clients}
        now={today}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <section className="overview-panel rounded-xl border p-4 sm:p-5" aria-labelledby="task-flow-heading">
          <div className="flex items-start justify-between gap-3"><div><h2 id="task-flow-heading" className="text-sm font-semibold">Task flow</h2><p className="mt-1 text-xs text-muted-foreground">Tasks by their current stage.</p></div><button type="button" onClick={() => router.push("/tasks")} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Open tasks <ArrowRight className="size-3.5" /></button></div>
          <div className="mt-4 space-y-3">{statusCounts.map(({ status, count }) => <div key={status} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2 text-xs"><span className="truncate text-muted-foreground">{getStatusLabel(status)}</span><div className="h-2 overflow-hidden rounded-full bg-secondary/35"><div className="h-full rounded-full bg-primary/75 transition-[width]" style={{ width: `${count ? Math.max(5, count / maxStatusCount * 100) : 0}%` }} /></div><span className="text-right font-medium tabular-nums">{count}</span></div>)}</div>
        </section>

        <section className="overview-panel rounded-xl border p-4 sm:p-5" aria-labelledby="next-action-heading">
          <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarClock className="size-4" /></span><div><h2 id="next-action-heading" className="text-sm font-semibold">Recommended focus</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{nextAction}</p></div></div>
          {(overdueTasks[0] ?? highPriorityDueSoon[0] ?? reviewTasks[0]) && <FocusTaskButton task={overdueTasks[0] ?? highPriorityDueSoon[0] ?? reviewTasks[0]} overdue={Boolean(overdueTasks[0])} openTask={openTask} />}
        </section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="overview-panel rounded-xl border p-4 sm:p-5" aria-labelledby="content-dates-heading">
          <div className="flex items-start justify-between gap-3"><div><h2 id="content-dates-heading" className="text-sm font-semibold">Content deadlines</h2><p className="mt-1 text-xs text-muted-foreground">Due or scheduled in the next 7 days.</p></div><button type="button" onClick={() => router.push("/calendar")} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Calendar <ArrowRight className="size-3.5" /></button></div>
          {upcomingContent.length ? <div className="mt-3 divide-y">{upcomingContent.slice(0, 5).map((item) => <ContentRow key={item.id} item={item} />)}</div> : <p className="mt-4 rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">No content deadlines coming up this week.</p>}
        </section>

        {isSupervisor ? <section className="overview-panel rounded-xl border p-4 sm:p-5" aria-labelledby="team-load-heading">
          <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Users className="size-4" /></span><div><h2 id="team-load-heading" className="text-sm font-semibold">Team workload</h2><p className="mt-1 text-xs text-muted-foreground">Active tasks grouped by primary owner.</p></div></div>
          {workloadByOwner.length ? <div className="mt-3 divide-y">{workloadByOwner.slice(0, 6).map((person) => <div key={person.ownerId} className="flex items-center justify-between gap-3 py-2.5"><span className="truncate text-xs font-medium">{person.ownerName}</span><span className="shrink-0 text-[11px] text-muted-foreground">{person.count} active · {person.reviews} review</span></div>)}</div> : <p className="mt-4 rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">No active tasks in this view.</p>}
        </section> : <section className="overview-panel rounded-xl border p-4 sm:p-5" aria-labelledby="due-tasks-heading">
          <div className="flex items-start justify-between gap-3"><div><h2 id="due-tasks-heading" className="text-sm font-semibold">Upcoming tasks</h2><p className="mt-1 text-xs text-muted-foreground">Your next active task deadlines.</p></div><button type="button" onClick={() => router.push("/tasks")} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">My tasks <ArrowRight className="size-3.5" /></button></div>
          {activeTasks.filter((task) => { const days = dayDistance(task.dueAt, today); return days !== null && days >= 0 && days <= 7 }).sort((a, b) => (asDate(a.dueAt)?.getTime() ?? Infinity) - (asDate(b.dueAt)?.getTime() ?? Infinity)).slice(0, 5).map((task) => <TaskRow key={task.id} task={task} onClick={() => openTask(task.id)} />)}
          {!activeTasks.some((task) => { const days = dayDistance(task.dueAt, today); return days !== null && days >= 0 && days <= 7 }) && <p className="mt-4 rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">No task deadlines in the next 7 days.</p>}
        </section>}
      </div>

      <section className="overview-panel mt-4 rounded-xl border p-4 sm:p-5" aria-labelledby="completed-activity-heading">
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-medium">Completion trend</p><p className="mt-0.5 text-[10px] text-muted-foreground">{trendGrouping === "daily" ? "Last 7 days" : trendGrouping === "weekly" ? "Last 6 weeks" : "Last 6 months"}</p></div><label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">Group<select aria-label="Group completion trend" value={trendGrouping} onChange={(event) => setTrendGrouping(event.target.value as TrendGrouping)} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div>{completedTasks.some((task) => Boolean(asDate(task.completedAt))) ? <div className={`mt-3 grid h-28 items-end gap-2 ${trendGrouping === "daily" ? "grid-cols-7" : "grid-cols-6"}`} aria-label={`${trendGrouping} completed task trend`}>{completionTrend.map((period) => <div key={period.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-1" aria-label={`${period.label}: ${period.count} completed`}><span className="text-[10px] tabular-nums text-muted-foreground">{period.count}</span><div className="flex h-16 w-full items-end rounded-t bg-secondary/25"><div className="w-full rounded-t bg-primary/75 transition-[height]" style={{ height: `${period.count ? Math.max(8, period.count / maxTrendCompletions * 100) : 0}%` }} /></div><span className="truncate text-[9px] text-muted-foreground">{period.label}</span></div>)}</div> : <p className="mt-3 rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">Completion trend will appear as dated tasks are completed.</p>}</div>
          <div className="min-w-0"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium">Completed tasks <span className="text-muted-foreground">({filteredCompletedTasks.length})</span></p><div className="flex items-center gap-2"><label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">Date range<select aria-label="Filter completed tasks by date range" value={completionRange} onChange={(event) => setCompletionRange(event.target.value as CompletionRange)} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="all">All</option></select></label><button type="button" onClick={() => router.push("/tasks")} className="text-[11px] font-medium text-primary hover:underline">Open task list</button></div></div>{filteredCompletedTasks.length ? <div className="mt-2 divide-y">{filteredCompletedTasks.slice(0, 6).map((task) => <TaskRow key={task.id} task={task} onClick={() => openTask(task.id)} completed />)}</div> : <p className="mt-3 rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">No completed tasks in this date range.</p>}</div>
        </div>
      </section>
    </main>
  )
}

function ContentReportingSummary({ items, loading, error, demoMode, range, onRangeChange, clientId, onClientChange, clients, now }: {
  items: InsightsContentItem[]
  loading: boolean
  error: string | null
  demoMode: boolean
  range: ContentDateRange
  onRangeChange: (range: ContentDateRange) => void
  clientId: string
  onClientChange: (clientId: string) => void
  clients: Array<{ id: string; name: string }>
  now: Date
}) {
  const counts = getContentCategoryCounts(items)
  const formats = getContentFormatBreakdown(items)
  const trend = getPublishedContentTrend(items, now)
  const maxTrend = Math.max(1, ...trend.map((period) => period.count))
  const staticEnd = counts.total ? counts.static / counts.total * 100 : 0
  const videoEnd = counts.total ? (counts.static + counts.video) / counts.total * 100 : 0
  const background = counts.total
    ? `conic-gradient(var(--chart-1) 0% ${staticEnd}%, var(--chart-2) ${staticEnd}% ${videoEnd}%, var(--chart-3) ${videoEnd}% 100%)`
    : "var(--secondary)"

  return <section className="overview-panel mt-4 rounded-xl border p-4 sm:p-5" aria-labelledby="content-reporting-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="content-reporting-heading" className="text-sm font-semibold">Content output</h2><p className="mt-1 text-xs text-muted-foreground">All non-archived tracker records, including published, rejected, and cancelled items.</p></div>
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">Client<select aria-label="Filter content insights by client" value={clientId} onChange={(event) => onClientChange(event.target.value)} className="h-8 max-w-44 rounded-md border bg-background px-2 text-xs text-foreground"><option value="all">All clients</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">Publish date<select aria-label="Filter content insights by publish date" value={range} onChange={(event) => onRangeChange(event.target.value as ContentDateRange)} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"><option value="all">All dates</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 365 days</option></select></label>
      </div>
    </div>
    {loading ? <p role="status" className="mt-4 text-xs text-muted-foreground">Loading content reporting…</p>
      : error ? <p role="alert" className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-3 text-xs text-destructive">{error}</p>
      : demoMode ? <p className="mt-4 rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">Content reporting is available in a connected workspace.</p>
      : <>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Content counts">
          <MetricCard label="Total content" value={counts.total} detail="All categories" icon={<ListTodo className="size-4" />} />
          <MetricCard label="Static" value={counts.static} detail="Images, carousels and graphics" icon={<CheckCircle2 className="size-4" />} />
          <MetricCard label="Video" value={counts.video} detail="Reels and video formats" icon={<CheckCircle2 className="size-4" />} />
          <MetricCard label="Other" value={counts.other} detail="Ambiguous or manually classified" icon={<CircleAlert className="size-4" />} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">All dates includes undated and future-scheduled content. A date range uses the saved publish date; content without one is excluded from that range. User scope uses the assigned creator, or the creator of an unassigned item.</p>
        {counts.total ? <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[.8fr_1.2fr]">
          <div className="rounded-lg border border-border/70 p-3">
            <h3 className="text-xs font-semibold">Category split</h3>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div role="img" aria-label={`${counts.static} static, ${counts.video} video, ${counts.other} other; ${counts.total} total`} className="size-32 shrink-0 rounded-full border border-border/50" style={{ background }}><div aria-hidden="true" className="m-[22%] size-[56%] rounded-full bg-card" /></div>
              <dl className="grid min-w-32 flex-1 gap-2 text-xs">{([ ["Static", counts.static, "var(--chart-1)"], ["Video", counts.video, "var(--chart-2)"], ["Other", counts.other, "var(--chart-3)"] ] as const).map(([label, count, color]) => <div key={label} className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: color }} /><dt className="flex-1">{label}</dt><dd className="font-semibold tabular-nums">{count}</dd></div>)}</dl>
            </div>
          </div>
          <div className="rounded-lg border border-border/70 p-3"><h3 className="text-xs font-semibold">Saved formats</h3><p className="mt-1 text-[11px] text-muted-foreground">The original subtype remains visible alongside the reporting category.</p><dl className="mt-2 grid gap-1.5 sm:grid-cols-2">{formats.slice(0, 8).map((entry) => <div key={entry.label} className="flex justify-between gap-2 rounded bg-secondary/25 px-2 py-1.5 text-xs"><dt className="truncate">{entry.label}</dt><dd className="font-semibold tabular-nums">{entry.count}</dd></div>)}{formats.length > 8 && <div className="flex justify-between gap-2 rounded bg-secondary/25 px-2 py-1.5 text-xs"><dt>Remaining formats</dt><dd className="font-semibold tabular-nums">{formats.slice(8).reduce((sum, entry) => sum + entry.count, 0)}</dd></div>}</dl></div>
        </div> : <p className="mt-4 rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">No content matches this user, client, and publish-date view.</p>}
        <div className="mt-4 rounded-lg border border-border/70 p-3"><h3 className="text-xs font-semibold">Published output</h3><p className="mt-1 text-[11px] text-muted-foreground">Published items by their saved publish date, last six calendar months. A missing publish date cannot appear in this trend.</p>{trend.some((period) => period.count > 0) ? <div className="mt-3 grid h-32 grid-cols-6 items-end gap-2" role="img" aria-label={`Published content trend: ${trend.map((period) => `${period.label} ${period.count}`).join(", ")}`}>{trend.map((period) => <div key={period.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-1" aria-hidden="true"><span className="text-[10px] tabular-nums">{period.count}</span><div className="flex h-20 w-full items-end rounded-t bg-secondary/25"><div className="w-full rounded-t bg-primary/75" style={{ height: `${period.count ? Math.max(8, period.count / maxTrend * 100) : 0}%` }} /></div><span className="truncate text-[9px] text-muted-foreground">{period.label}</span></div>)}</div> : <p className="mt-3 text-xs text-muted-foreground">No dated published items in the last six months for this view.</p>}</div>
      </>}
  </section>
}

function MetricCard({ label, value, detail, icon, alert = false }: { label: string; value: number; detail: string; icon: React.ReactNode; alert?: boolean }) {
  return <article className="overview-panel rounded-xl border p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-muted-foreground">{label}</p><span className={`grid size-8 place-items-center rounded-lg ${alert ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{icon}</span></div><p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></article>
}

function TaskRow({ task, onClick, completed = false }: { task: WorkflowTask; onClick: () => void; completed?: boolean }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 border-b py-2.5 text-left last:border-0 hover:bg-background/50"><span className="min-w-0"><span className="block truncate text-xs font-medium">{task.title}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{task.clientName} · {getStatusLabel(task.status)}</span></span><span className="shrink-0 text-[11px] text-muted-foreground">{shortDate(completed ? task.completedAt : task.dueAt)}</span></button>
}

function FocusTaskButton({ task, overdue, openTask }: { task: WorkflowTask; overdue: boolean; openTask: (taskId: string) => void }) {
  const detail = overdue ? `Overdue · Due ${shortDate(task.dueAt)}` : task.status === "for_review" ? `Awaiting review · ${task.primaryOwner.name}` : `${task.priority === "urgent" ? "Urgent" : "High priority"} · Due ${shortDate(task.dueAt)}`
  return <button type="button" onClick={() => openTask(task.id)} className={`mt-4 flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left ${overdue ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10" : "bg-background/60 hover:bg-secondary/20"}`}><span className="min-w-0"><span className="block truncate text-xs font-semibold">{task.title}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{task.clientName} · {detail}</span></span><ArrowRight className="size-4 shrink-0 text-primary" /></button>
}

function ContentRow({ item }: { item: WorkflowContentWorkItem & { days: number } }) {
  const label = item.days === 0 ? "Today" : item.days === 1 ? "Tomorrow" : shortDate(item.deadlineAt ?? item.publishAt)
  return <div className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0"><span className="block truncate text-xs font-medium">{item.title}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{item.clientName} · {item.platform} · {item.status.replaceAll("_", " ")}</span></span><span className="shrink-0 text-[11px] font-medium text-muted-foreground">{label}</span></div>
}
