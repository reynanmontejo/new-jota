"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTaskDrawer } from "@/features/tasks/task-drawer"
import { useWorkflow } from "@/features/workflow/workflow-provider"
import { getTaskDueTimestamp } from "@/features/workflow/task-dates"
import { shiftCalendarMonth } from "@/features/calendar/calendar-month"

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
  ownerId?: string | null
  ownerName?: string | null
}

type DeadlineUrgency = "overdue" | "soon" | "upcoming"

const deadlineStyles: Record<DeadlineUrgency, { label: string; legendLabel: string; className: string; dateClassName: string }> = {
  overdue: { label: "Past due", legendLabel: "Past due", className: "border-rose-500/25 bg-rose-500/12 text-rose-900 dark:text-rose-200", dateClassName: "bg-rose-500/15 text-rose-900 dark:text-rose-200" },
  soon: { label: "Due soon", legendLabel: "Due within 3 days", className: "border-amber-500/25 bg-amber-500/14 text-amber-900 dark:text-amber-200", dateClassName: "bg-amber-500/15 text-amber-900 dark:text-amber-200" },
  upcoming: { label: "Upcoming", legendLabel: "Later deadline", className: "border-emerald-600/20 bg-emerald-600/10 text-emerald-900 dark:text-emerald-200", dateClassName: "bg-emerald-600/12 text-emerald-900 dark:text-emerald-200" },
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

export function getDeadlineUrgency(date: string, today = dateKey(new Date())): DeadlineUrgency {
  const dueTime = Date.parse(`${date}T00:00:00Z`)
  const todayTime = Date.parse(`${today}T00:00:00Z`)
  if (Number.isNaN(dueTime) || Number.isNaN(todayTime)) return "upcoming"
  const daysUntilDue = Math.floor((dueTime - todayTime) / 86_400_000)
  if (daysUntilDue < 0) return "overdue"
  return daysUntilDue <= 3 ? "soon" : "upcoming"
}

export function filterContentByOwner(posts: ContentCalendarPost[], ownerFilter: string, currentUserId: string) {
  if (ownerFilter === "all") return posts
  if (ownerFilter === "mine") return posts.filter((post) => post.ownerId === currentUserId)
  return posts.filter((post) => post.ownerId === ownerFilter)
}

export function getCalendarDayPreview<T>(events: T[], limit = 2) {
  const visibleEvents = events.slice(0, Math.max(0, limit))
  return { visibleEvents, remainingCount: Math.max(0, events.length - visibleEvents.length) }
}

export function ContentCalendar({ contentPosts, contentError = false, clientId, monthKey, onMonthChange }: { contentPosts?: ContentCalendarPost[]; contentError?: boolean; clientId?: string; monthKey?: string; onMonthChange?: (monthKey: string) => void }) {
  const [localMonth, setLocalMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const month = monthKey ? new Date(`${monthKey}-01T12:00:00`) : localMonth
  const { tasks, currentUser } = useWorkflow()
  const { openTask } = useTaskDrawer()
  const [contentOwnerFilter, setContentOwnerFilter] = useState("all")
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
  const ownerOptions = [...new Map(visibleScheduledContent.flatMap((post) => post.ownerId && post.ownerName ? [[post.ownerId, post.ownerName] as const] : [])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
  const ownerFilteredContent = currentUser.role === "supervisor"
    ? filterContentByOwner(visibleScheduledContent, contentOwnerFilter, currentUser.id)
    : visibleScheduledContent
  const scheduledEvents = ownerFilteredContent.map((item) => ({ ...item, date: scheduledDateKey(item.date) }))
  const scheduledEventsByDate = new Map<string, typeof scheduledEvents>()
  for (const item of scheduledEvents) {
    const events = scheduledEventsByDate.get(item.date) ?? []
    events.push(item)
    scheduledEventsByDate.set(item.date, events)
  }
  const deadlinesByDate = new Map<string, typeof deadlines>()
  for (const item of deadlines) {
    const events = deadlinesByDate.get(item.date) ?? []
    events.push(item)
    deadlinesByDate.set(item.date, events)
  }
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [detailsMinimized, setDetailsMinimized] = useState(false)
  const [detailsClosing, setDetailsClosing] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])
  const selectedPosts = selectedDate ? scheduledEvents.filter((item) => item.date === selectedDate) : []
  const selectedDeadlines = selectedDate ? deadlines.filter((item) => item.date === selectedDate) : []
  const selectedDateLabel = selectedDate
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${selectedDate}T12:00:00`))
    : ""
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`
  const agenda = [
    ...scheduledEvents.filter((item) => item.date.startsWith(monthPrefix)).map((item) => ({ key: item.id, date: item.date, title: item.title, detail: `${item.eventType === "deadline" ? `${deadlineStyles[getDeadlineUrgency(item.date)].label} content deadline` : "Publish"} · ${item.client} · ${item.channel}`, urgency: item.eventType === "deadline" ? getDeadlineUrgency(item.date) : null, taskId: null as string | null })),
    ...deadlines.filter((item) => item.date.startsWith(monthPrefix)).map(({ date, task }) => ({ key: task.id, date, title: task.title, detail: `${deadlineStyles[getDeadlineUrgency(date)].label} task deadline · ${task.clientName} · ${task.primaryOwner.name}`, urgency: getDeadlineUrgency(date), taskId: task.id })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  function changeMonth(offset: number) {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setSelectedDate(null)
    setDetailsMinimized(false)
    setDetailsClosing(false)
    if (monthKey && onMonthChange) onMonthChange(shiftCalendarMonth(monthKey, offset))
    else setLocalMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  function selectDate(date: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setSelectedDate(date)
    setDetailsMinimized(false)
    setDetailsClosing(false)
  }

  function closeDetails() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSelectedDate(null)
      return
    }
    setDetailsClosing(true)
    closeTimer.current = setTimeout(() => {
      setSelectedDate(null)
      setDetailsClosing(false)
      closeTimer.current = null
    }, 240)
  }

  return (
    <div className="mx-auto max-w-[1480px] px-0 py-2 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
        <div className="flex flex-wrap items-center gap-2">
          {currentUser.role === "supervisor" && <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">Content owner
            <select aria-label="Filter calendar content by owner" className="h-9 rounded-md border bg-background px-2.5 text-sm text-foreground" value={contentOwnerFilter} onChange={(event) => setContentOwnerFilter(event.target.value)}>
              <option value="all">Everyone</option>
              <option value="mine">My content</option>
              {ownerOptions.filter(([id]) => id !== currentUser.id).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>}
          <div className="flex items-center gap-2"><Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft /></Button><span className="min-w-32 text-center text-sm font-semibold">{monthLabel}</span><Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight /></Button></div>
        </div>
      </div>
      {contentError && <p role="status" className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">Scheduled content couldn’t be loaded. Task deadlines are still available.</p>}
      <div aria-label="Calendar legend" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary/55" />Scheduled content</span>
        {(Object.entries(deadlineStyles) as [DeadlineUrgency, typeof deadlineStyles[DeadlineUrgency]][]).map(([urgency, style]) => <span key={urgency} className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-sm ${style.dateClassName}`} />{style.legendLabel}</span>)}
      </div>
      <div key={monthPrefix} className={`calendar-month-enter mt-4 grid min-w-0 grid-cols-1 items-start gap-3 transition-[grid-template-columns,column-gap] duration-300 ease-out motion-reduce:transition-none ${selectedDate && !detailsClosing ? detailsMinimized ? "lg:grid-cols-[minmax(0,1fr)_4rem]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]" : "lg:grid-cols-[minmax(0,1fr)_0fr] lg:gap-x-0"}`}>
        <section aria-label={`${monthLabel} calendar`} className="overview-panel hidden min-w-0 overflow-hidden rounded-lg border md:block">
          <div className="grid grid-cols-7 border-b bg-secondary/15 text-center text-[11px] font-semibold text-muted-foreground">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="py-2">{day}</div>)}</div>
          <div className="grid grid-cols-7">
            {Array.from({ length: firstWeekday }, (_, index) => <div key={`empty-${index}`} className="min-h-24 border-b border-r bg-muted/10" />)}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1
              const date = dateKey(new Date(month.getFullYear(), month.getMonth(), day))
              const posts = scheduledEventsByDate.get(date) ?? []
              const due = deadlinesByDate.get(date) ?? []
              const dayEvents = [
                ...posts.map((post) => ({ key: `content-${post.id}`, title: post.title, urgency: post.eventType === "deadline" ? getDeadlineUrgency(date) : null as DeadlineUrgency | null, taskId: null as string | null, detail: `${post.eventType === "deadline" ? "Content deadline" : "Publish"}: ${post.title} · ${post.client} · ${post.channel}` })),
                ...due.map(({ task }) => ({ key: `task-${task.id}`, title: task.title, urgency: getDeadlineUrgency(date), taskId: task.id, detail: `${getDeadlineUrgency(date)} task deadline: ${task.title}` })),
              ]
              const { visibleEvents, remainingCount } = getCalendarDayPreview(dayEvents)
              return <div key={date} className={`group relative min-h-24 min-w-0 border-b border-r p-1.5 sm:p-2 ${selectedDate === date ? "bg-primary/5" : ""}`}>
                <button type="button" onClick={() => selectDate(date)} aria-label={`View details for ${monthLabel} ${day}`} aria-pressed={selectedDate === date} className="absolute inset-0 z-0 rounded-sm text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <span className="absolute left-1.5 top-1.5 grid min-h-6 min-w-6 place-items-center rounded px-1 text-[11px] font-semibold group-hover:bg-primary/10 sm:left-2 sm:top-2">{day}</span>
                </button>
                <div className="pointer-events-none relative z-10 mt-7 space-y-1">
                  {visibleEvents.map((event) => {
                    const style = event.urgency ? deadlineStyles[event.urgency] : null
                    return <button key={event.key} type="button" onClick={() => event.taskId ? openTask(event.taskId) : selectDate(date)} title={event.detail} className={`pointer-events-auto block w-full truncate rounded border px-1.5 py-1 text-left text-[10px] font-medium ${style ? style.className : "border-primary/15 bg-primary/12 text-primary"}`}>{style ? `${style.label}: ` : ""}{event.title}</button>
                  })}
                  {remainingCount > 0 && <button type="button" onClick={() => selectDate(date)} aria-label={`View ${remainingCount} more items for ${date}`} className="pointer-events-auto block w-full truncate rounded px-1.5 py-1 text-left text-[10px] font-semibold text-primary hover:bg-primary/10">+{remainingCount} more</button>}
                </div>
              </div>
            })}
          </div>
        </section>
        <section aria-label={`${monthLabel} agenda`} className="space-y-2 md:hidden">
        {agenda.length === 0 ? <div className="overview-panel rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">No scheduled content or task deadlines this month.</div> : agenda.map((event) => (
          <button type="button" key={`${event.date}-${event.key}`} onClick={() => event.taskId ? openTask(event.taskId) : selectDate(event.date)} className={`overview-panel flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left ${event.urgency ? deadlineStyles[event.urgency].className : "hover:border-primary/40"}`}>
            <span className={`grid size-10 shrink-0 place-items-center rounded-md text-xs font-semibold ${event.urgency ? deadlineStyles[event.urgency].dateClassName : "bg-secondary/35"}`}>{Number(event.date.slice(-2))}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{event.title}</p><p className="truncate text-xs text-muted-foreground">{event.detail}</p></div>
            <span className="shrink-0 text-xs font-medium text-primary">Details</span>
          </button>
        ))}
        </section>
        {selectedDate && <section aria-label={`Details for ${selectedDateLabel}`} data-closing={detailsClosing || undefined} className={`calendar-details-panel overview-panel min-w-0 rounded-lg border ${detailsClosing ? "pointer-events-none lg:overflow-hidden" : ""} ${detailsMinimized ? "flex items-center justify-between gap-2 p-2 lg:flex-col lg:justify-start" : "p-4 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto"}`} aria-live="polite">
        {detailsMinimized ? <>
          <span className="min-w-0 truncate text-xs font-medium lg:hidden">{selectedDateLabel}</span>
          <Button variant="outline" size="sm" onClick={() => setDetailsMinimized(false)} aria-label={`Expand details for ${selectedDateLabel}`}>Expand</Button>
          <Button variant="ghost" size="sm" onClick={closeDetails}>Close</Button>
        </> : <>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5"><CalendarDays className="mt-0.5 size-4 text-primary" aria-hidden="true" /><div><h2 className="text-sm font-semibold">{selectedDateLabel}</h2><p className="mt-0.5 text-xs text-muted-foreground">{selectedPosts.length + selectedDeadlines.length ? `${selectedPosts.length + selectedDeadlines.length} item${selectedPosts.length + selectedDeadlines.length === 1 ? "" : "s"} scheduled` : "Nothing scheduled"}</p></div></div>
          <div className="flex shrink-0 items-center gap-1"><Button variant="ghost" size="sm" onClick={() => setDetailsMinimized(true)}>Minimize</Button><Button variant="ghost" size="sm" onClick={closeDetails}>Close</Button></div>
        </div>
        {(selectedPosts.length > 0 || selectedDeadlines.length > 0) && <div className="mt-3 divide-y rounded-md border">
          {selectedPosts.map((post) => {
            const urgency = post.eventType === "deadline" ? getDeadlineUrgency(post.date) : null
            return <article key={post.id} className={`space-y-1.5 border-l-2 p-3 ${urgency ? deadlineStyles[urgency].className : ""}`}>
            <div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 break-words text-sm font-medium">{post.title}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] ${urgency ? deadlineStyles[urgency].className : "bg-secondary/45"}`}>{urgency ? deadlineStyles[urgency].label : "Publish"}</span>{post.status && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] capitalize text-primary">{post.status.replaceAll("_", " ")}</span>}</div>
            <p className="text-xs text-muted-foreground">{post.client} · {post.channel}{post.contentType ? ` · ${post.contentType}` : ""}</p>
            {post.description && <p className="whitespace-pre-wrap text-xs leading-relaxed">{post.description}</p>}
            {post.nextAction && <p className="text-xs"><span className="font-medium">Next action:</span> {post.nextAction}</p>}
            {post.revisionNotes && <p className="text-xs"><span className="font-medium">Revision notes:</span> {post.revisionNotes}</p>}
            {post.clientApprovalStatus && <p className="text-xs"><span className="font-medium">Client approval:</span> {post.clientApprovalStatus.replaceAll("_", " ")}</p>}
            {post.clientIssues && <p className="whitespace-pre-wrap text-xs"><span className="font-medium">Client issues:</span> {post.clientIssues}</p>}
            {post.notes && <p className="whitespace-pre-wrap text-xs"><span className="font-medium">Notes:</span> {post.notes}</p>}
          </article>
          })}
          {selectedDeadlines.map(({ date, task }) => {
            const urgency = getDeadlineUrgency(date)
            const style = deadlineStyles[urgency]
            return <button key={task.id} type="button" onClick={() => openTask(task.id)} className={`flex w-full items-center gap-2.5 border-l-2 p-3 text-left ${style.className}`}><CircleCheck className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{task.title}</span><span className="block text-xs">{style.label} task deadline · {task.clientName} · {task.primaryOwner.name}</span></span><span className="shrink-0 text-xs font-medium">Open task</span></button>
          })}
        </div>}
        </>}
        </section>}
      </div>
    </div>
  )
}
