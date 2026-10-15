"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Archive, ChevronDown, Files, ListPlus, LoaderCircle, Plus, RotateCcw, Search } from "lucide-react"

import { archiveContentItem, restoreContentItem, saveContentItem } from "@/app/content/actions"
import { ClientFiles } from "@/features/clients/client-files"
import { ContentImport } from "@/features/content/content-import"
import { ContentSubmitButton } from "@/features/content/content-submit-button"
import { useTaskDrawer } from "@/features/tasks/task-drawer"

export type TrackerClient = { id: string; name: string }
export type TrackerCampaign = { id: string; client_id: string; name: string; status: string }
export type TrackerAssignee = { id: string; display_name: string }
export type TrackerItem = {
  id: string
  client_id: string
  campaign_id: string
  title: string
  platform: string
  content_type: string
  description: string | null
  status: string
  work_date: string | null
  deadline_at: string | null
  publish_at: string | null
  client_approval_status: string | null
  client_issues: string | null
  notes: string | null
  revision_count: number
  revision_notes: string | null
  next_action: string | null
  assigned_to: string | null
  client_name: string
  campaign_name: string
  assignee_name: string | null
}

const statuses = ["idea", "planned", "in_production", "for_review", "revision_requested", "waiting_client", "scheduled", "published", "rejected", "cancelled"]
const statusLabels: Record<string, string> = {
  idea: "Idea", planned: "Planned", in_production: "In production", for_review: "For review", revision_requested: "Revision requested", waiting_client: "Waiting for client", scheduled: "Scheduled", published: "Published", rejected: "Rejected", cancelled: "Cancelled",
}
const approvalLabels: Record<string, string> = { pending: "Pending", approved: "Approved", revision_requested: "Revision requested", rejected: "Rejected" }
const canReceiveNewContent = (campaign: TrackerCampaign) => campaign.status === "active" || campaign.status === "draft"
const fieldClass = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
const labelClass = "grid gap-1.5 text-[11px] font-medium text-muted-foreground"

function formatDate(value: string | null) {
  if (!value) return "Not scheduled"
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
  return Number.isNaN(date.getTime()) ? "Not scheduled" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date)
}

function dateInputValue(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function ContentFilesDisclosure({ clientId, contentItemId, canUpload }: { clientId: string; contentItemId: string; canUpload: boolean }) {
  const [open, setOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)
  const panelId = `content-files-${contentItemId}`

  function toggle() {
    setOpen((current) => !current)
    setHasOpened(true)
  }

  return <section className="mt-1.5 border-t border-border/60 pt-1">
    <button type="button" aria-expanded={open} aria-controls={panelId} onClick={toggle} className="flex w-full items-center justify-between py-1 text-left text-[10px] font-semibold text-primary">
      <span className="flex items-center gap-1.5"><Files className="size-3" />Files and review</span>
      <ChevronDown aria-hidden="true" className={`size-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
    </button>
    <div id={panelId} hidden={!open}>
      {hasOpened && <ClientFiles clientId={clientId} contentItemId={contentItemId} canUpload={canUpload} />}
    </div>
  </section>
}

function ContentForm({ clients, campaigns, assignees, item, canEdit, currentUserId }: { clients: TrackerClient[]; campaigns: TrackerCampaign[]; assignees: Record<string, TrackerAssignee[]>; item?: TrackerItem; canEdit: boolean; currentUserId: string }) {
  const [clientId, setClientId] = useState(item?.client_id ?? clients[0]?.id ?? "")
  const clientCampaigns = campaigns.filter((campaign) => campaign.client_id === clientId)
  const activeCampaigns = clientCampaigns.filter(canReceiveNewContent)
  const initialCampaignId = item?.campaign_id ?? activeCampaigns.find((campaign) => campaign.name.toLocaleLowerCase() === "general / ongoing")?.id ?? ""
  const [campaignId, setCampaignId] = useState(initialCampaignId)
  const selectedCampaign = clientCampaigns.some((campaign) => campaign.id === campaignId && (canReceiveNewContent(campaign) || campaign.id === item?.campaign_id)) ? campaignId : ""

  const showClient = clients.length > 1
  const showCampaign = activeCampaigns.length > 0 || Boolean(item && clientCampaigns.some((campaign) => campaign.id === item.campaign_id))

  return <form action={saveContentItem} className="grid gap-3">
    {item && <input type="hidden" name="id" value={item.id} />}
    {!showClient && <input type="hidden" name="clientId" value={clientId} />}
    {!showCampaign && <input type="hidden" name="campaignId" value={selectedCampaign} />}
    {!item && <input type="hidden" name="status" value="planned" />}
    {!item && <input type="hidden" name="revisionNotes" value="" />}
    <p className="text-xs leading-5 text-muted-foreground">Create one tracker card for one post or creative piece. It records where and when it will be published. Add an optional linked task from the saved content card when assigned work needs separate tracking.</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {showClient && <label className={labelClass}>Client<select className={fieldClass} name="clientId" value={clientId} onChange={(event) => { setClientId(event.target.value); const next = campaigns.filter((campaign) => campaign.client_id === event.target.value && canReceiveNewContent(campaign)); setCampaignId(next.find((campaign) => campaign.name.toLocaleLowerCase() === "general / ongoing")?.id ?? "") }} required>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>}
      {showCampaign && <label className={labelClass}>Campaign <span className="font-normal">(optional)</span><select className={fieldClass} name="campaignId" value={selectedCampaign} onChange={(event) => setCampaignId(event.target.value)}><option value="">General / Ongoing (default)</option>{clientCampaigns.filter((campaign) => canReceiveNewContent(campaign) || campaign.id === item?.campaign_id).map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}{!canReceiveNewContent(campaign) ? " (closed · existing content)" : ""}</option>)}</select></label>}
      <label className={labelClass}>Content idea / title<input className={fieldClass} name="title" placeholder="e.g. What to expect on your first dive" defaultValue={item?.title ?? ""} required minLength={2} maxLength={200} /></label>
      <label className={labelClass}>Platform<input className={fieldClass} name="platform" placeholder="Instagram" defaultValue={item?.platform ?? ""} required minLength={2} maxLength={60} /></label>
      <label className={labelClass}>Format<input className={fieldClass} name="contentType" placeholder="Reel, carousel, static" defaultValue={item?.content_type ?? ""} required minLength={2} maxLength={80} /></label>
      <label className={labelClass}>Publish date <span className="font-normal">(optional)</span><input className={fieldClass} type="datetime-local" name="publishAt" defaultValue={dateInputValue(item?.publish_at ?? null)} /></label>
    </div>
    {!showCampaign && <p className="text-[11px] text-muted-foreground">New content is grouped under General / Ongoing automatically.</p>}
    <details className="rounded-md border border-border/70 bg-background/40 px-3 py-2" open={Boolean(item)}>
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Optional details</summary>
      <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
        {item && <label className={labelClass}>Status<select className={fieldClass} name="status" defaultValue={item.status}>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>}
        <label className={labelClass}>Work date<input className={fieldClass} type="date" name="workDate" defaultValue={item?.work_date ?? ""} /></label>
        <label className={labelClass}>Deadline<input className={fieldClass} type="date" name="deadlineAt" defaultValue={item?.deadline_at ?? ""} /></label>
        <label className={labelClass}>Client approval<select className={fieldClass} name="clientApprovalStatus" defaultValue={item?.client_approval_status ?? ""}><option value="">Not set</option>{Object.entries(approvalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={labelClass}>Next action<input className={fieldClass} name="nextAction" placeholder="Send draft for review" defaultValue={item?.next_action ?? ""} maxLength={500} /></label>
        <label className={labelClass}>Assigned creator / editor<select className={fieldClass} name="assignedTo" defaultValue={item ? item.assigned_to ?? "" : currentUserId}><option value="">Not assigned</option>{(assignees[clientId] ?? []).map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select></label>
        {item && <label className={labelClass}>Revision count<input className={`${fieldClass} bg-muted/50`} value={item.revision_count} readOnly aria-label="Revision count" /></label>}
        <label className={`${labelClass} sm:col-span-2`}>Brief / caption notes<textarea className="min-h-16 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" name="description" maxLength={5000} defaultValue={item?.description ?? ""} /></label>
        <label className={`${labelClass} sm:col-span-2`}>Client issues<textarea className="min-h-16 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" name="clientIssues" maxLength={5000} defaultValue={item?.client_issues ?? ""} /></label>
        <label className={`${labelClass} sm:col-span-2`}>Notes / comments<textarea className="min-h-16 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" name="notes" maxLength={5000} defaultValue={item?.notes ?? ""} /></label>
        {item && <label className={`${labelClass} sm:col-span-2`}>Latest revision feedback<textarea className="min-h-16 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" name="revisionNotes" maxLength={5000} defaultValue={item.revision_notes ?? ""} placeholder="Record the latest revision notes" /></label>}
      </div>
    </details>
    <div className="flex flex-wrap items-center gap-2">
      <ContentSubmitButton pendingLabel={item ? "Saving…" : "Adding…"} disabled={!canEdit || !clients.length}>{item ? "Save changes" : "Add to tracker"}</ContentSubmitButton>
    </div>
  </form>
}

export function ContentTracker({ clients, campaigns, assignees, items, canCreate, canEdit, canCreateTask, currentUserId, canAssignContent, notice, importedCount, skippedCount, isArchivedView = false }: {
  clients: TrackerClient[]; campaigns: TrackerCampaign[]; assignees: Record<string, TrackerAssignee[]>; items: TrackerItem[]; canCreate: boolean; canEdit: boolean; canCreateTask: boolean; currentUserId: string; canAssignContent: boolean; notice?: string; importedCount?: number; skippedCount?: number; isArchivedView?: boolean
}) {
  const { openNewTask } = useTaskDrawer()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [clientFilter, setClientFilter] = useState("all")
  const [hiddenItemIds, setHiddenItemIds] = useState<Set<string>>(() => new Set())
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [undoContentId, setUndoContentId] = useState<string | null>(null)
  const [undoItem, setUndoItem] = useState<TrackerItem | null>(null)
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const availableItems = useMemo(() => items.filter((item) => !hiddenItemIds.has(item.id)), [items, hiddenItemIds])
  const visibleItems = useMemo(() => availableItems.filter((item) => {
    const text = `${item.title} ${item.client_name} ${item.campaign_name} ${item.platform} ${item.content_type} ${item.status} ${item.client_approval_status ?? ""} ${item.client_issues ?? ""} ${item.notes ?? ""} ${item.revision_notes ?? ""} ${item.assignee_name ?? ""}`.toLocaleLowerCase()
    return (!query || text.includes(query.trim().toLocaleLowerCase())) && (statusFilter === "all" || item.status === statusFilter) && (clientFilter === "all" || item.client_id === clientFilter)
  }), [availableItems, query, statusFilter, clientFilter])
  const notices: Record<string, string> = { created: "Content added to the tracker.", updated: "Content updated.", archived: "Content moved out of the active tracker.", imported: `${importedCount ?? 0} content rows imported; ${skippedCount ?? 0} duplicates skipped.`, import_too_large: "CSV file exceeds the 1 MB limit.", invalid_import: "CSV import failed validation. Review the row preview and required columns.", content_migration_missing: "Apply the local content workflow alignment migration under supabase/migrations, then refresh.", campaign_paused: "The default campaign is paused or closed. Ask a supervisor or admin to reopen it, then try again.", invalid: "Check the required fields and try again.", failed: "The change could not be saved. Refresh and try again.", forbidden: "Your account does not have permission for that change." }

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])

  function expireUndo() {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => {
      setUndoContentId(null)
      setUndoItem(null)
      setFeedback(null)
      undoTimer.current = null
    }, 6000)
  }

  async function archiveItem(item: TrackerItem) {
    if (pendingAction) return
    setPendingAction(`archive:${item.id}`)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = null
    setUndoContentId(null)
    setUndoItem(null)
    setFeedback(null)
    try {
      const result = await archiveContentItem(item.id)
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        return
      }
      setHiddenItemIds((current) => new Set(current).add(item.id))
      setUndoContentId(item.id)
      setUndoItem(item)
      setFeedback({ kind: "success", message: `“${item.title}” archived.` })
      expireUndo()
    } catch {
      setFeedback({ kind: "error", message: "The content could not be archived. Check your connection and try again." })
    } finally {
      setPendingAction(null)
    }
  }

  async function undoArchive(item: TrackerItem) {
    if (pendingAction) return
    setPendingAction(`undo:${item.id}`)
    try {
      const result = await restoreContentItem(item.id)
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        setUndoContentId(null)
        return
      }
      if (undoTimer.current) clearTimeout(undoTimer.current)
      undoTimer.current = null
      setHiddenItemIds((current) => { const next = new Set(current); next.delete(item.id); return next })
      setUndoContentId(null)
      setUndoItem(null)
      setFeedback({ kind: "success", message: `“${item.title}” restored.` })
    } catch {
      setFeedback({ kind: "error", message: "The content could not be restored. Open Archived content and try again." })
      setUndoContentId(null)
      setUndoItem(null)
    } finally {
      setPendingAction(null)
    }
  }

  async function restoreItem(item: TrackerItem) {
    if (pendingAction) return
    setPendingAction(`restore:${item.id}`)
    setFeedback(null)
    try {
      const result = await restoreContentItem(item.id)
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        return
      }
      setHiddenItemIds((current) => new Set(current).add(item.id))
      setFeedback({ kind: "success", message: `“${item.title}” restored to active content.` })
    } catch {
      setFeedback({ kind: "error", message: "The content could not be restored. Check your connection and try again." })
    } finally {
      setPendingAction(null)
    }
  }

  return <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{isArchivedView ? "Archived content" : "Content tracker"}</h1>
      <div className="text-right"><p className="text-lg font-semibold tabular-nums">{availableItems.length}</p><p className="text-[11px] text-muted-foreground">{isArchivedView ? "archived items" : "active content items"}</p></div>
    </div>
    {notice && notices[notice] && <p role="status" className="mt-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">{notices[notice]}</p>}
    <nav aria-label="Content views" className="mt-4 flex gap-1 border-b border-border/80">
      <Link href="/content" aria-current={!isArchivedView ? "page" : undefined} className={`border-b-2 px-3 py-2 text-xs font-medium ${!isArchivedView ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Active</Link>
      {canEdit && <Link href="/content?view=archived" aria-current={isArchivedView ? "page" : undefined} className={`border-b-2 px-3 py-2 text-xs font-medium ${isArchivedView ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Archived</Link>}
    </nav>
    {feedback && <div role={feedback.kind === "error" ? "alert" : "status"} aria-live={feedback.kind === "error" ? "assertive" : "polite"} className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${feedback.kind === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-primary/20 bg-primary/5"}`}>
      <span>{feedback.message}</span>
      {undoContentId && undoItem && !isArchivedView && <button type="button" disabled={pendingAction === `undo:${undoContentId}`} onClick={() => void undoArchive(undoItem)} className="inline-flex items-center gap-1.5 font-semibold text-primary underline-offset-2 hover:underline disabled:opacity-60">
        {pendingAction === `undo:${undoContentId}` ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
        {pendingAction === `undo:${undoContentId}` ? "Restoring…" : "Undo"}
      </button>}
    </div>}
    {!isArchivedView && canCreate && <details className="group mt-4 rounded-lg border border-border bg-card/80 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><Plus className="size-4 text-primary" />Add content</span><span className="text-[11px] font-normal text-muted-foreground">Create one planned post or creative item</span></summary>
      <div className="mt-3 border-t pt-3">{clients.length ? <ContentForm clients={clients} campaigns={campaigns} assignees={assignees} canEdit={canCreate} currentUserId={currentUserId} /> : <p className="text-xs text-muted-foreground">Add an active client before adding tracked content.</p>}</div>
    </details>}
    {!isArchivedView && canCreate && <ContentImport clients={clients} campaigns={campaigns} assignees={assignees} items={items} currentUserId={currentUserId} canAssignContent={canAssignContent} />}
    <section className="mt-4 overflow-hidden rounded-lg border border-border bg-card/75" aria-label="Tracked content">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <label className="relative min-w-52 flex-1"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input className={`${fieldClass} pl-8`} aria-label="Search content" placeholder="Search content, client, platform" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select className={`${fieldClass} w-auto min-w-36`} aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>
        <select className={`${fieldClass} w-auto min-w-36`} aria-label="Filter by client" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}><option value="all">All clients</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
      </div>
      {!visibleItems.length ? <div className="px-4 py-12 text-center"><p className="text-sm font-medium">{availableItems.length ? "No matching content" : isArchivedView ? "No archived content" : "No content tracked yet"}</p><p className="mt-1 text-xs text-muted-foreground">{availableItems.length ? "Try a different search or filter." : isArchivedView ? "Archived items will appear here and can be restored." : "Add the team’s upcoming posts and creative deliverables here."}</p></div> : <div className="grid gap-2.5 p-2.5 sm:grid-cols-2 2xl:grid-cols-3">
        {visibleItems.map((item) => <article id={`content-item-${item.id}`} key={item.id} className="scroll-mt-24 min-w-0 rounded-lg border border-border/80 bg-background/70 p-3 transition hover:border-primary/25 hover:bg-background/90">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><h2 className="truncate text-xs font-semibold">{item.title}</h2><p className="mt-1 truncate text-[10px] text-muted-foreground">{item.client_name} · {item.campaign_name} · {item.platform} / {item.content_type}</p></div>
            <span className="shrink-0 rounded-md border border-primary/15 bg-primary/5 px-1.5 py-0.5 text-[9px] font-medium">{statusLabels[item.status] ?? item.status}</span>
          </div>
          {item.next_action && <p className="mt-2 truncate text-[10px]"><span className="font-medium">Next:</span> <span className="text-muted-foreground">{item.next_action}</span></p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2 text-[10px]">
            <p className="font-medium">Publish: {formatDate(item.publish_at)}</p>
            <p className="text-muted-foreground">Deadline: {formatDate(item.deadline_at)}</p>
            {item.revision_count > 0 && <p className="text-muted-foreground">{item.revision_count} revision{item.revision_count === 1 ? "" : "s"}</p>}
          </div>
          {item.assignee_name && <p className="mt-1 truncate text-[10px] text-muted-foreground">Creator/editor: {item.assignee_name}</p>}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {!isArchivedView && canCreateTask && !["published", "cancelled", "rejected"].includes(item.status) && <button type="button" onClick={() => openNewTask({ contentItemId: item.id, contentItemTitle: item.title, title: `Create assets: ${item.title}`, clientId: item.client_id, clientName: item.client_name, campaignName: item.campaign_name, deadlineAt: item.deadline_at })} className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/25 bg-background/70 px-2 text-[10px] font-medium text-primary transition hover:bg-primary/5"><ListPlus className="size-3" />Add task</button>}
              {isArchivedView && canEdit && <button type="button" disabled={Boolean(pendingAction)} onClick={() => void restoreItem(item)} className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/25 bg-background/70 px-2 text-[10px] font-medium text-primary transition hover:bg-primary/5 disabled:cursor-wait disabled:opacity-60">
                {pendingAction === `restore:${item.id}` ? <LoaderCircle className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                {pendingAction === `restore:${item.id}` ? "Restoring…" : "Restore"}
              </button>}
              {!isArchivedView && canEdit && <details className="relative"><summary className="inline-flex h-7 cursor-pointer list-none items-center rounded-md border border-border/80 bg-background/70 px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">Edit</summary><div className="overview-panel absolute right-0 z-30 mt-1.5 max-h-[min(78vh,720px)] w-[min(48rem,calc(100vw-2.5rem))] overflow-y-auto rounded-lg border bg-card p-3 shadow-xl"><ContentForm clients={clients.filter((client) => client.id === item.client_id)} campaigns={campaigns.filter((campaign) => campaign.client_id === item.client_id)} assignees={assignees} item={item} canEdit={canEdit} currentUserId={currentUserId} /><div className="mt-3 border-t pt-3"><button type="button" disabled={Boolean(pendingAction)} onClick={() => void archiveItem(item)} className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 text-xs text-destructive transition hover:underline disabled:cursor-wait disabled:opacity-60">
                {pendingAction === `archive:${item.id}` ? <LoaderCircle className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}
                {pendingAction === `archive:${item.id}` ? "Archiving…" : "Archive item"}
              </button></div></div></details>}
            </div>
            {item.work_date && <span className="text-[9px] text-muted-foreground">Work {formatDate(item.work_date)}</span>}
          </div>
          {(item.client_approval_status || item.client_issues || item.notes || item.revision_notes) && <details className="mt-2 border-t border-border/60 pt-1.5">
            <summary className="cursor-pointer list-none text-[10px] font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">More details</summary>
            <div className="mt-1.5 grid gap-1 text-[10px] text-muted-foreground">
              {item.client_approval_status && <p>Client approval: <span className="font-medium text-foreground">{approvalLabels[item.client_approval_status] ?? item.client_approval_status}</span></p>}
              {item.client_issues && <p>Client issues: {item.client_issues}</p>}
              {item.notes && <p>Notes: {item.notes}</p>}
              {item.revision_notes && <p><span className="font-medium text-foreground">Latest feedback:</span> {item.revision_notes}</p>}
            </div>
          </details>}
          <ContentFilesDisclosure clientId={item.client_id} contentItemId={item.id} canUpload={canEdit && !isArchivedView} />
        </article>)}
      </div>}
    </section>
    <p className="mt-3 text-[10px] text-muted-foreground">This is the shared content list for account managers and supervisors. Posts stay here and on Calendar; use Add task when a separate assigned work item is useful.</p>
  </main>
}
