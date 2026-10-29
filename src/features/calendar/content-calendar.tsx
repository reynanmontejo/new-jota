"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CalendarCheck2, CalendarDays, ChevronLeft, ChevronRight, Film, ImageIcon, ListTodo, PanelRightClose, PanelRightOpen, Plus, UsersRound, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTaskDrawer } from "@/features/tasks/task-drawer"
import { useWorkflow } from "@/features/workflow/workflow-provider"
import { getTaskDueTimestamp } from "@/features/workflow/task-dates"
import { shiftCalendarMonth } from "@/features/calendar/calendar-month"
import { deadlineStyles, getDeadlineUrgencyForDays } from "@/features/calendar/deadline-urgency"

export type ContentCalendarPost = {
  id: string
  date: string
  title: string
  clientId: string
  client: string
  channel: string
  contentType?: string
  contentCategory?: "static" | "video" | "other"
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

import type { DeadlineUrgency } from "@/features/calendar/deadline-urgency"

const contentCategoryStyles = {
  video: "border-violet-300/70 bg-violet-50/70 text-violet-950 dark:border-violet-800/70 dark:bg-violet-950/35 dark:text-violet-100",
  static: "border-emerald-300/70 bg-emerald-50/70 text-emerald-950 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-100",
  other: "border-primary/15 bg-primary/12 text-primary",
}
const contentCategoryAccents = {
  video: "border-l-4 border-l-violet-500",
  static: "border-l-4 border-l-emerald-600",
  other: "",
}

const demoScheduledContent: ContentCalendarPost[] = [
  { id: "demo-founder-reel", date: "2026-09-28", title: "Founder story reel", clientId: "harbor-and-pine", client: "Harbor & Pine", channel: "Instagram", contentType: "Reel", contentCategory: "video", status: "scheduled" },
  { id: "demo-coffee-carousel", date: "2026-09-30", title: "Cold brew carousel", clientId: "northwind-coffee", client: "Northwind Coffee", channel: "LinkedIn", contentType: "Carousel", contentCategory: "static", status: "scheduled" },
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
  return getDeadlineUrgencyForDays(daysUntilDue)
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
  const selectedDateTrigger = useRef<HTMLButtonElement | null>(null)
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])
  const selectedPosts = selectedDate ? scheduledEvents.filter((item) => item.date === selectedDate) : []
  const selectedDeadlines = selectedDate ? deadlines.filter((item) => item.date === selectedDate) : []
  const selectedDateLabel = selectedDate
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${selectedDate}T12:00:00`))
    : ""
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`
  const agenda = [
    ...scheduledEvents.filter((item) => item.date.startsWith(monthPrefix)).map((item) => ({ key: item.id, date: item.date, title: item.title, detail: `${item.eventType === "deadline" ? `${deadlineStyles[getDeadlineUrgency(item.date)].label} content deadline` : "Publish"} · ${item.client} · ${item.channel}`, urgency: item.eventType === "deadline" ? getDeadlineUrgency(item.date) : null, category: item.contentCategory ?? "other", taskId: null as string | null })),
    ...deadlines.filter((item) => item.date.startsWith(monthPrefix)).map(({ date, task }) => ({ key: task.id, date, title: task.title, detail: `${deadlineStyles[getDeadlineUrgency(date)].label} task deadline · ${task.clientName} · ${task.primaryOwner.name}`, urgency: getDeadlineUrgency(date), category: "other" as const, taskId: task.id })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  function changeMonth(offset: number) {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setSelectedDate(null)
    setDetailsMinimized(false)
    setDetailsClosing(false)
    if (monthKey && onMonthChange) onMonthChange(shiftCalendarMonth(monthKey, offset))
    else setLocalMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  function selectDate(date: string, trigger?: HTMLButtonElement) {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    if (trigger) selectedDateTrigger.current = trigger
    setSelectedDate(date)
    setDetailsMinimized(false)
    setDetailsClosing(false)
  }

  function closeDetails() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    selectedDateTrigger.current?.focus({ preventScroll: true })
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSelectedDate(null)
      return
    }
    setDetailsClosing(true)
    closeTimer.current = setTimeout(() => {
      setSelectedDate(null)
      setDetailsClosing(false)
      closeTimer.current = null
    }, 300)
  }

  return (
    <div className="mx-auto max-w-[1480px] px-0 py-2 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/70 bg-card/65 p-3 sm:p-4">
        <div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/10 text-primary"><CalendarDays className="size-5" aria-hidden="true" /></span><div><h1 className="text-xl font-semibold tracking-tight">Calendar</h1><p className="mt-0.5 text-xs text-muted-foreground">Plan posts and keep track of deadlines.</p></div></div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {currentUser.role === "supervisor" && <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><UsersRound className="size-4" aria-hidden="true" /><span className="sr-only">Content owner</span>
            <select aria-label="Filter calendar content by owner" className="h-9 max-w-44 rounded-lg border border-input bg-background/80 px-2.5 text-xs text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15" value={contentOwnerFilter} onChange={(event) => setContentOwnerFilter(event.target.value)}>
              <option value="all">Everyone</option>
              <option value="mine">My content</option>
              {ownerOptions.filter(([id]) => id !== currentUser.id).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>}
          <Button variant="outline" size="lg" className="rounded-lg bg-background/80 text-xs" aria-label="Go to current month" title="Return to this month" onClick={() => { const today = new Date(); changeMonth((today.getFullYear() - month.getFullYear()) * 12 + today.getMonth() - month.getMonth()) }}><CalendarCheck2 aria-hidden="true" />Today</Button>
          <div className="ml-auto flex items-center rounded-lg border border-border bg-background/80 p-0.5 sm:ml-0" role="group" aria-label="Calendar month navigation"><Button variant="ghost" size="icon" aria-label="Previous month" title="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft aria-hidden="true" /></Button><span className="min-w-32 px-1 text-center text-sm font-semibold tabular-nums" aria-live="polite">{monthLabel}</span><Button variant="ghost" size="icon" aria-label="Next month" title="Next month" onClick={() => changeMonth(1)}><ChevronRight aria-hidden="true" /></Button></div>
        </div>
      </div>
      {contentError && <p role="status" className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">Scheduled content couldn’t be loaded. Task deadlines are still available.</p>}
      <div aria-label="Calendar legend" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary/55" />Scheduled content</span>
        {(Object.entries(deadlineStyles) as [DeadlineUrgency, typeof deadlineStyles[DeadlineUrgency]][]).map(([urgency, style]) => <span key={urgency} className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-sm ${style.dotClassName}`} />{style.legendLabel}</span>)}
      </div>
      <div key={monthPrefix} className={`calendar-month-enter mt-4 grid min-w-0 grid-cols-1 items-start gap-3 transition-[grid-template-columns,column-gap] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${selectedDate && !detailsClosing ? detailsMinimized ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,4rem)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,0rem)] lg:gap-x-0"}`}>
        <section aria-label={`${monthLabel} calendar`} className="overview-panel hidden min-w-0 overflow-hidden rounded-xl border md:block">
          <div className="grid grid-cols-7 border-b bg-secondary/15 text-center text-[11px] font-semibold text-muted-foreground">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="py-2">{day}</div>)}</div>
          <div className="grid grid-cols-7">
            {Array.from({ length: firstWeekday }, (_, index) => <div key={`empty-${index}`} className="min-h-24 border-b border-r bg-muted/10" />)}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1
              const date = dateKey(new Date(month.getFullYear(), month.getMonth(), day))
              const posts = scheduledEventsByDate.get(date) ?? []
              const due = deadlinesByDate.get(date) ?? []
              const dayEvents = [
                ...posts.map((post) => ({ key: `content-${post.id}`, title: post.title, urgency: post.eventType === "deadline" ? getDeadlineUrgency(date) : null as DeadlineUrgency | null, category: post.contentCategory ?? "other", taskId: null as string | null, detail: `${post.eventType === "deadline" ? "Content deadline" : "Publish"}: ${post.title} · ${post.client} · ${post.channel}` })),
                ...due.map(({ task }) => ({ key: `task-${task.id}`, title: task.title, urgency: getDeadlineUrgency(date), category: "other" as const, taskId: task.id, detail: `${getDeadlineUrgency(date)} task deadline: ${task.title}` })),
              ]
              const { visibleEvents, remainingCount } = getCalendarDayPreview(dayEvents)
              const isToday = date === dateKey(new Date())
              return <div key={date} className={`group relative min-h-28 min-w-0 border-b border-r p-1.5 transition-colors duration-200 motion-reduce:transition-none sm:p-2 ${selectedDate === date ? "bg-primary/7" : ""}`}>
                <button type="button" onClick={(event) => selectDate(date, event.currentTarget)} aria-label={`View details for ${monthLabel} ${day}`} aria-pressed={selectedDate === date} aria-current={isToday ? "date" : undefined} className="absolute inset-0 z-0 rounded-sm text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <span className={`absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full text-[11px] font-semibold transition-colors sm:left-2 sm:top-2 ${isToday ? "bg-primary text-primary-foreground shadow-sm" : selectedDate === date ? "bg-primary/15 text-primary" : "group-hover:bg-primary/10"}`}>{day}</span>
                </button>
                <div className="pointer-events-none relative z-10 mt-7 space-y-1">
                  {visibleEvents.map((event) => {
                    const style = event.urgency ? deadlineStyles[event.urgency] : null
                    const EventIcon = event.taskId ? ListTodo : event.category === "video" ? Film : event.category === "static" ? ImageIcon : CalendarDays
                    return <button key={event.key} type="button" onClick={(click) => event.taskId ? openTask(event.taskId) : selectDate(date, click.currentTarget)} title={event.detail} className={`pointer-events-auto flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-left text-[10px] font-medium transition-[background-color,box-shadow,transform] duration-200 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${style ? style.className : contentCategoryStyles[event.category]} ${!event.taskId ? contentCategoryAccents[event.category] : ""}`}><EventIcon className="size-3 shrink-0 opacity-75" aria-hidden="true" /><span className="truncate">{style ? `${style.label}: ` : ""}{event.title}</span></button>
                  })}
                  {remainingCount > 0 && <button type="button" onClick={(event) => selectDate(date, event.currentTarget)} aria-label={`View ${remainingCount} more items for ${date}`} className="pointer-events-auto flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Plus className="size-3" aria-hidden="true" />{remainingCount} more<ChevronRight className="ml-auto size-3" aria-hidden="true" /></button>}
                </div>
              </div>
            })}
          </div>
        </section>
        <section aria-label={`${monthLabel} agenda`} className="space-y-2 md:hidden">
        {agenda.length === 0 ? <div className="overview-panel rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">No scheduled content or task deadlines this month.</div> : agenda.map((event) => (
          <button type="button" key={`${event.date}-${event.key}`} onClick={(click) => event.taskId ? openTask(event.taskId) : selectDate(event.date, click.currentTarget)} className={`overview-panel flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-[box-shadow,transform] duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${event.urgency ? deadlineStyles[event.urgency].className : contentCategoryStyles[event.category]} ${!event.taskId ? contentCategoryAccents[event.category] : ""}`}>
            <span className={`grid size-10 shrink-0 place-items-center rounded-md text-xs font-semibold ${event.urgency ? deadlineStyles[event.urgency].dateClassName : "bg-secondary/35"}`}>{Number(event.date.slice(-2))}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{event.title}</p><p className="truncate text-xs text-muted-foreground">{event.detail}</p></div>
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">Details<ChevronRight className="size-4" aria-hidden="true" /></span>
          </button>
        ))}
        </section>
        {selectedDate && <section aria-label={`Details for ${selectedDateLabel}`} data-closing={detailsClosing || undefined} className={`calendar-details-panel overview-panel min-w-0 overflow-hidden rounded-xl border border-primary/15 shadow-sm ${detailsClosing ? "pointer-events-none" : ""} ${detailsMinimized ? "flex items-center justify-between gap-2 p-2 lg:flex-col lg:justify-start" : "lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto"}`} aria-live="polite">
        {detailsMinimized ? <>
          <span className="min-w-0 truncate text-xs font-medium lg:hidden">{selectedDateLabel}</span>
          <span className="calendar-details-content hidden flex-col items-center gap-0.5 py-1 lg:flex"><CalendarDays className="mb-1 size-4 text-primary" aria-hidden="true" /><span className="text-base font-semibold tabular-nums">{Number(selectedDate.slice(-2))}</span><span className="text-[9px] uppercase tracking-wide text-muted-foreground">{new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(`${selectedDate}T12:00:00`))}</span></span>
          <Button variant="outline" size="icon" className="ml-auto lg:ml-0" onClick={() => setDetailsMinimized(false)} aria-label={`Expand details for ${selectedDateLabel}`} title="Expand day details"><PanelRightOpen aria-hidden="true" /></Button>
          <Button variant="ghost" size="icon" onClick={closeDetails} aria-label="Close" title="Close day details"><X aria-hidden="true" /></Button>
        </> : <>
        <div className="flex items-start justify-between gap-2 border-b border-border/70 bg-primary/5 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2.5"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-primary/15 bg-background/70"><CalendarDays className="size-4 text-primary" aria-hidden="true" /></span><div className="min-w-0"><h2 className="text-sm font-semibold leading-5">{selectedDateLabel}</h2><p className="mt-1 text-[11px] text-muted-foreground">{selectedPosts.length + selectedDeadlines.length ? `${selectedPosts.length + selectedDeadlines.length} item${selectedPosts.length + selectedDeadlines.length === 1 ? "" : "s"} scheduled` : "Nothing scheduled"}</p></div></div>
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-background/70 p-0.5"><Button variant="ghost" size="icon-sm" onClick={() => setDetailsMinimized(true)} aria-label="Minimize" title="Minimize day details"><PanelRightClose aria-hidden="true" /></Button><Button variant="ghost" size="icon-sm" onClick={closeDetails} aria-label="Close" title="Close day details"><X aria-hidden="true" /></Button></div>
        </div>
        <div key={selectedDate} className="calendar-details-content p-3">
        {(selectedPosts.length > 0 || selectedDeadlines.length > 0) ? <>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-medium text-muted-foreground"><span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-2.5 py-1"><CalendarDays className="size-3" aria-hidden="true" />{selectedPosts.length} content</span><span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-2.5 py-1"><ListTodo className="size-3" aria-hidden="true" />{selectedDeadlines.length} tasks</span></div>
        <div className="space-y-2">
          {selectedPosts.map((post) => {
            const urgency = post.eventType === "deadline" ? getDeadlineUrgency(post.date) : null
            const ContentIcon = post.contentCategory === "video" ? Film : post.contentCategory === "static" ? ImageIcon : CalendarDays
            return <article key={post.id} className={`space-y-2 rounded-xl border p-3 ${urgency ? deadlineStyles[urgency].className : contentCategoryStyles[post.contentCategory ?? "other"]} ${contentCategoryAccents[post.contentCategory ?? "other"]}`}>
            <div className="flex items-start gap-2"><ContentIcon className="mt-0.5 size-4 shrink-0 opacity-75" aria-hidden="true" /><h3 className="min-w-0 break-words text-sm font-semibold leading-5">{post.title}</h3></div>
            <div className="flex flex-wrap items-center gap-1.5"><span className={`rounded-full border border-current/10 px-2 py-0.5 text-[10px] ${urgency ? deadlineStyles[urgency].className : "bg-background/60"}`}>{urgency ? deadlineStyles[urgency].label : "Publish"}</span>{post.status && <span className="rounded-full border border-primary/15 bg-background/60 px-2 py-0.5 text-[10px] capitalize text-primary">{post.status.replaceAll("_", " ")}</span>}</div>
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
            return <button key={task.id} type="button" onClick={() => openTask(task.id)} className={`group/task flex w-full items-center gap-2.5 rounded-xl border border-l-4 p-3 text-left transition-shadow duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${style.className}`}><ListTodo className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{task.title}</span><span className="block text-xs">{style.label} task deadline · {task.clientName} · {task.primaryOwner.name}</span></span><span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-current/15 bg-background/50 px-2 py-1.5 text-[10px] font-semibold">Open task<ChevronRight className="size-3 transition-transform group-hover/task:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" /></span></button>
          })}
        </div></> : <div className="flex flex-col items-center px-3 py-8 text-center"><span className="mb-3 grid size-12 place-items-center rounded-2xl border border-primary/10 bg-primary/5"><CalendarCheck2 className="size-6 text-primary/65" aria-hidden="true" /></span><p className="text-sm font-medium">A clear day</p><p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">No content or task deadlines are scheduled for this date.</p></div>}
        </div>
        </>}
        </section>}
      </div>
    </div>
  )
}
