"use client"

import { useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTaskDrawer } from "@/features/tasks/task-drawer"
import { useWorkflow } from "@/features/workflow/workflow-provider"
import { getTaskDueTimestamp } from "@/features/workflow/task-dates"

export type ContentCalendarPost = {
  id: string
  date: string
  title: string
  clientId: string
  client: string
  channel: string
  contentType?: string
  status?: string
  eventType?: "publish" | "deadline"
  description?: string | null
  nextAction?: string | null
  revisionNotes?: string | null
  clientApprovalStatus?: string | null
  clientIssues?: string | null
  notes?: string | null
}

const demoScheduledContent: ContentCalendarPost[] = [
  { id: "demo-founder-reel", date: "2026-09-28", title: "Founder story reel", clientId: "harbor-and-pine", client: "Harbor & Pine", channel: "Instagram", contentType: "Reel", status: "scheduled" },
  { id: "demo-coffee-carousel", date: "2026-09-30", title: "Cold brew carousel", clientId: "northwind-coffee", client: "Northwind Coffee", channel: "LinkedIn", contentType: "Carousel", status: "scheduled" },
  { id: "demo-product-spotlight", date: "2026-10-02", title: "Product spotlight", clientId: "luma-skincare", client: "Luma Skincare", channel: "Facebook", contentType: "Post", status: "scheduled" },
]

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function scheduledDateKey(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : dateKey(parsed)
}

export function ContentCalendar({ contentPosts, contentError = false, clientId }: { contentPosts?: ContentCalendarPost[]; contentError?: boolean; clientId?: string }) {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const { tasks, currentUser } = useWorkflow()
  const { openTask } = useTaskDrawer()
  const firstWeekday = month.getDay()
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(month)

  const deadlines = useMemo(() => tasks.flatMap((task) => {
    if (clientId && task.clientId !== clientId) return []
    if (currentUser.role !== "supervisor" && task.primaryOwner.id !== currentUser.id) return []
    const parsed = new Date(getTaskDueTimestamp(task))
    return Number.isNaN(parsed.getTime()) ? [] : [{ date: dateKey(parsed), task }]
  }), [tasks, clientId, currentUser.id, currentUser.role])
  const accessibleClientIds = new Set(tasks.filter((task) => currentUser.role === "supervisor" || task.primaryOwner.id === currentUser.id).map((task) => task.clientId))
  const scheduledContent = contentPosts ?? demoScheduledContent
  const visibleScheduledContent = contentPosts ? scheduledContent : currentUser.role === "supervisor" ? scheduledContent : scheduledContent.filter((item) => accessibleClientIds.has(item.clientId))
  const scheduledEvents = visibleScheduledContent.map((item) => ({ ...item, date: scheduledDateKey(item.date) }))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const selectedPosts = selectedDate ? scheduledEvents.filter((item) => item.date === selectedDate) : []
  const selectedDeadlines = selectedDate ? deadlines.filter((item) => item.date === selectedDate) : []
  const selectedDateLabel = selectedDate
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${selectedDate}T12:00:00`))
    : ""
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`
  const agenda = [
    ...scheduledEvents.filter((item) => item.date.startsWith(monthPrefix)).map((item) => ({ key: item.id, date: item.date, title: item.title, detail: `${item.eventType === "deadline" ? "Deadline" : "Publish"} · ${item.client} · ${item.channel}`, taskId: null as string | null })),
    ...deadlines.filter((item) => item.date.startsWith(monthPrefix)).map(({ date, task }) => ({ key: task.id, date, title: task.title, detail: `${task.clientName} · ${task.primaryOwner.name}`, taskId: task.id })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  function changeMonth(offset: number) {
    setSelectedDate(null)
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  return (
    <div className="mx-auto max-w-[1480px] px-0 py-2 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-semibold tracking-tight">Calendar</h1><p className="mt-1 text-xs text-muted-foreground">Scheduled content and your task deadlines</p></div>
        <div className="flex items-center gap-2"><Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft /></Button><span className="min-w-32 text-center text-sm font-semibold">{monthLabel}</span><Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight /></Button></div>
      </div>
      {contentError && <p role="status" className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">Scheduled content couldn’t be loaded. Task deadlines are still available.</p>}
      <section aria-label={`${monthLabel} calendar`} className="overview-panel mt-4 hidden overflow-hidden rounded-lg border md:block">
        <div className="grid grid-cols-7 border-b bg-secondary/15 text-center text-[11px] font-semibold text-muted-foreground">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="py-2">{day}</div>)}</div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstWeekday }, (_, index) => <div key={`empty-${index}`} className="min-h-24 border-b border-r bg-muted/10" />)}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const day = index + 1
            const date = dateKey(new Date(month.getFullYear(), month.getMonth(), day))
            const posts = scheduledEvents.filter((item) => item.date === date)
            const due = deadlines.filter((item) => item.date === date)
            return <div key={date} className={`group relative min-h-24 min-w-0 border-b border-r p-1.5 sm:p-2 ${selectedDate === date ? "bg-primary/5" : ""}`}>
              <button type="button" onClick={() => setSelectedDate(date)} aria-label={`View details for ${monthLabel} ${day}`} aria-pressed={selectedDate === date} className="absolute inset-0 z-0 rounded-sm text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="absolute left-1.5 top-1.5 grid min-h-6 min-w-6 place-items-center rounded px-1 text-[11px] font-semibold group-hover:bg-primary/10 sm:left-2 sm:top-2">{day}</span>
              </button>
              <div className="pointer-events-none relative z-10 mt-7 space-y-1">{posts.map((post) => <button key={post.id} type="button" onClick={() => setSelectedDate(date)} title={`${post.eventType === "deadline" ? "Deadline" : "Publish"}: ${post.title} · ${post.client} · ${post.channel}`} className={`pointer-events-auto block w-full truncate rounded px-1.5 py-1 text-left text-[10px] font-medium hover:bg-primary/20 ${post.eventType === "deadline" ? "bg-amber-500/12 text-amber-800 dark:text-amber-200" : "bg-primary/12 text-primary"}`}>{post.eventType === "deadline" ? "Due: " : ""}{post.title}</button>)}{due.map(({ task }) => <button key={task.id} type="button" onClick={() => openTask(task.id)} title={`Due: ${task.title}`} className="pointer-events-auto block w-full truncate rounded bg-secondary/30 px-1.5 py-1 text-left text-[10px] hover:bg-secondary/50">Due: {task.title}</button>)}</div>
            </div>
          })}
        </div>
      </section>
      <section aria-label={`${monthLabel} agenda`} className="mt-4 space-y-2 md:hidden">
        {agenda.length === 0 ? <div className="overview-panel rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">No scheduled content or task deadlines this month.</div> : agenda.map((event) => (
          <button type="button" key={`${event.date}-${event.key}`} onClick={() => event.taskId ? openTask(event.taskId) : setSelectedDate(event.date)} className="overview-panel flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left hover:border-primary/40">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary/35 text-xs font-semibold">{Number(event.date.slice(-2))}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{event.title}</p><p className="truncate text-xs text-muted-foreground">{event.detail}</p></div>
            <span className="shrink-0 text-xs font-medium text-primary">Details</span>
          </button>
        ))}
      </section>
      {selectedDate && <section aria-label={`Details for ${selectedDateLabel}`} className="overview-panel mt-4 rounded-lg border p-4" aria-live="polite">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5"><CalendarDays className="mt-0.5 size-4 text-primary" aria-hidden="true" /><div><h2 className="text-sm font-semibold">{selectedDateLabel}</h2><p className="mt-0.5 text-xs text-muted-foreground">{selectedPosts.length + selectedDeadlines.length ? `${selectedPosts.length + selectedDeadlines.length} item${selectedPosts.length + selectedDeadlines.length === 1 ? "" : "s"} scheduled` : "Nothing scheduled"}</p></div></div>
          <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>Close</Button>
        </div>
        {(selectedPosts.length > 0 || selectedDeadlines.length > 0) && <div className="mt-3 divide-y rounded-md border">
          {selectedPosts.map((post) => <article key={post.id} className="space-y-1.5 p-3">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium">{post.title}</h3><span className="rounded-full bg-secondary/45 px-2 py-0.5 text-[10px]">{post.eventType === "deadline" ? "Deadline" : "Publish"}</span>{post.status && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] capitalize text-primary">{post.status.replaceAll("_", " ")}</span>}</div>
            <p className="text-xs text-muted-foreground">{post.client} · {post.channel}{post.contentType ? ` · ${post.contentType}` : ""}</p>
            {post.description && <p className="whitespace-pre-wrap text-xs leading-relaxed">{post.description}</p>}
            {post.nextAction && <p className="text-xs"><span className="font-medium">Next action:</span> {post.nextAction}</p>}
            {post.revisionNotes && <p className="text-xs"><span className="font-medium">Revision notes:</span> {post.revisionNotes}</p>}
            {post.clientApprovalStatus && <p className="text-xs"><span className="font-medium">Client approval:</span> {post.clientApprovalStatus.replaceAll("_", " ")}</p>}
            {post.clientIssues && <p className="whitespace-pre-wrap text-xs"><span className="font-medium">Client issues:</span> {post.clientIssues}</p>}
            {post.notes && <p className="whitespace-pre-wrap text-xs"><span className="font-medium">Notes:</span> {post.notes}</p>}
          </article>)}
          {selectedDeadlines.map(({ task }) => <button key={task.id} type="button" onClick={() => openTask(task.id)} className="flex w-full items-center gap-2.5 p-3 text-left hover:bg-muted/40"><CircleCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{task.title}</span><span className="block text-xs text-muted-foreground">{task.clientName} · {task.primaryOwner.name}</span></span><span className="text-xs text-primary">Open task</span></button>)}
        </div>}
      </section>}
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground"><span><span className="mr-1 inline-block size-2 rounded-sm bg-primary/50" />Scheduled content</span><span><span className="mr-1 inline-block size-2 rounded-sm bg-secondary" />{currentUser.role === "supervisor" ? "Team deadline" : "My deadline"}</span></div>
    </div>
  )
}
