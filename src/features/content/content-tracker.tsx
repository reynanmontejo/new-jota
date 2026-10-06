"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Archive, ArrowRight, Plus, Search } from "lucide-react"

import { archiveContentItem, saveContentItem } from "@/app/content/actions"
import { ClientFiles } from "@/features/clients/client-files"
import { ContentImport } from "@/features/content/content-import"
import { ContentSubmitButton } from "@/features/content/content-submit-button"

export type TrackerClient = { id: string; name: string }
export type TrackerCampaign = { id: string; client_id: string; name: string }
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

function ContentForm({ clients, campaigns, assignees, item, canEdit }: { clients: TrackerClient[]; campaigns: TrackerCampaign[]; assignees: Record<string, TrackerAssignee[]>; item?: TrackerItem; canEdit: boolean }) {
  const [clientId, setClientId] = useState(item?.client_id ?? clients[0]?.id ?? "")
  const clientCampaigns = campaigns.filter((campaign) => campaign.client_id === clientId)
  const initialCampaignId = item?.campaign_id ?? clientCampaigns[0]?.id ?? ""
  const [campaignId, setCampaignId] = useState(initialCampaignId)
  const selectedCampaign = clientCampaigns.some((campaign) => campaign.id === campaignId) ? campaignId : clientCampaigns[0]?.id ?? ""

  const showClient = clients.length > 1
  const showCampaign = clientCampaigns.length > 1

  return <form action={saveContentItem} className="grid gap-3">
    {item && <input type="hidden" name="id" value={item.id} />}
    {!showClient && <input type="hidden" name="clientId" value={clientId} />}
    {!showCampaign && <input type="hidden" name="campaignId" value={selectedCampaign} />}
    {!item && <input type="hidden" name="status" value="planned" />}
    {!item && <input type="hidden" name="revisionNotes" value="" />}
    <p className="text-xs leading-5 text-muted-foreground">Create one tracker card for one post or creative piece. It records the idea and where/when it will be published. It does not create a task; upload the finished design to the card for review.</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {showClient && <label className={labelClass}>Client<select className={fieldClass} name="clientId" value={clientId} onChange={(event) => { setClientId(event.target.value); const next = campaigns.filter((campaign) => campaign.client_id === event.target.value); setCampaignId(next.length === 1 ? next[0].id : "") }} required>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>}
      {showCampaign && <label className={labelClass}>Campaign<select className={fieldClass} name="campaignId" value={selectedCampaign} onChange={(event) => setCampaignId(event.target.value)} required disabled={!clientCampaigns.length}><option value="">Choose a campaign</option>{clientCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>}
      <label className={labelClass}>Content idea / title<input className={fieldClass} name="title" placeholder="e.g. What to expect on your first dive" defaultValue={item?.title ?? ""} required minLength={2} maxLength={200} /></label>
      <label className={labelClass}>Platform<input className={fieldClass} name="platform" placeholder="Instagram" defaultValue={item?.platform ?? ""} required minLength={2} maxLength={60} /></label>
      <label className={labelClass}>Format<input className={fieldClass} name="contentType" placeholder="Reel, carousel, static" defaultValue={item?.content_type ?? ""} required minLength={2} maxLength={80} /></label>
      <label className={labelClass}>Publish date <span className="font-normal">(optional)</span><input className={fieldClass} type="datetime-local" name="publishAt" defaultValue={dateInputValue(item?.publish_at ?? null)} /></label>
    </div>
    {clientCampaigns.length === 1 && <p className="text-[11px] text-muted-foreground">Grouped under campaign: <span className="font-medium text-foreground">{clientCampaigns[0].name}</span></p>}
    <details className="rounded-md border border-border/70 bg-background/40 px-3 py-2" open={Boolean(item)}>
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Optional details</summary>
      <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
        {item && <label className={labelClass}>Status<select className={fieldClass} name="status" defaultValue={item.status}>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>}
        <label className={labelClass}>Work date<input className={fieldClass} type="date" name="workDate" defaultValue={item?.work_date ?? ""} /></label>
        <label className={labelClass}>Deadline<input className={fieldClass} type="date" name="deadlineAt" defaultValue={item?.deadline_at ?? ""} /></label>
        <label className={labelClass}>Client approval<select className={fieldClass} name="clientApprovalStatus" defaultValue={item?.client_approval_status ?? ""}><option value="">Not set</option>{Object.entries(approvalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={labelClass}>Next action<input className={fieldClass} name="nextAction" placeholder="Send draft for review" defaultValue={item?.next_action ?? ""} maxLength={500} /></label>
        <label className={labelClass}>Assigned creator<select className={fieldClass} name="assignedTo" defaultValue={item?.assigned_to ?? ""}><option value="">Unassigned</option>{(assignees[clientId] ?? []).map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select></label>
        {item && <label className={labelClass}>Revision count<input className={`${fieldClass} bg-muted/50`} value={item.revision_count} readOnly aria-label="Revision count" /></label>}
        <label className={`${labelClass} sm:col-span-2`}>Brief / caption notes<textarea className="min-h-16 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" name="description" maxLength={5000} defaultValue={item?.description ?? ""} /></label>
        <label className={`${labelClass} sm:col-span-2`}>Client issues<textarea className="min-h-16 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" name="clientIssues" maxLength={5000} defaultValue={item?.client_issues ?? ""} /></label>
        <label className={`${labelClass} sm:col-span-2`}>Notes / comments<textarea className="min-h-16 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" name="notes" maxLength={5000} defaultValue={item?.notes ?? ""} /></label>
        {item && <label className={`${labelClass} sm:col-span-2`}>Latest revision feedback<textarea className="min-h-16 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" name="revisionNotes" maxLength={5000} defaultValue={item.revision_notes ?? ""} placeholder="Record the latest revision notes" /></label>}
      </div>
    </details>
    <div className="flex flex-wrap items-center gap-2">
      <ContentSubmitButton pendingLabel={item ? "Saving…" : "Adding…"} disabled={!canEdit || !clients.length || !clientCampaigns.length}>{item ? "Save changes" : "Add to tracker"}</ContentSubmitButton>
      {!clientCampaigns.length && <span className="text-[11px] text-muted-foreground">This client needs a campaign before content can be added.</span>}
    </div>
  </form>
}

function MyContentWorklist({ clients, items, canEdit }: { clients: TrackerClient[]; items: TrackerItem[]; canEdit: boolean }) {
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [clientFilter, setClientFilter] = useState("all")
  const visibleItems = useMemo(() => items.filter((item) => {
    const searchable = `${item.title} ${item.client_name} ${item.platform} ${item.content_type} ${item.status} ${item.next_action ?? ""}`.toLocaleLowerCase()
    return (!query || searchable.includes(query.trim().toLocaleLowerCase()))
      && (statusFilter === "all" || item.status === statusFilter)
      && (clientFilter === "all" || item.client_id === clientFilter)
  }), [items, query, statusFilter, clientFilter])

  return <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">Marketing operations</p><h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">My Content</h1><p className="mt-1 max-w-2xl text-xs text-muted-foreground">Content for clients you can access. Use this list to check the brief, production status, deadline, and next action.</p></div>
      <Link href="/content" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90">Open full tracker <ArrowRight className="size-3.5" /></Link>
    </div>
    <section className="mt-4 rounded-lg border border-border bg-card/75">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <label className="relative min-w-52 flex-1"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input className={`${fieldClass} pl-8`} aria-label="Search my content" placeholder="Search title, client, platform" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select className={`${fieldClass} w-auto min-w-36`} aria-label="Filter my content by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>
        <select className={`${fieldClass} w-auto min-w-36`} aria-label="Filter my content by client" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}><option value="all">All clients</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
      </div>
      {!visibleItems.length ? <div className="px-4 py-12 text-center"><p className="text-sm font-medium">{items.length ? "No matching content" : "No content to work on yet"}</p><p className="mt-1 text-xs text-muted-foreground">{items.length ? "Try a different search or filter." : "Content added for clients you can access will appear here."}</p></div> : <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-2">
        {visibleItems.map((item) => <article key={item.id} className="min-w-0 rounded-lg border border-border bg-background/60 p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.client_name} <span className="px-1">·</span> {item.platform} / {item.content_type}</p></div><span className="w-fit shrink-0 rounded-md border border-primary/15 bg-primary/5 px-2 py-1 text-[11px] font-medium">{statusLabels[item.status] ?? item.status}</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><p><span className="text-muted-foreground">Deadline</span><br /><span className="font-medium">{formatDate(item.deadline_at)}</span></p><p><span className="text-muted-foreground">Publish date</span><br /><span className="font-medium">{formatDate(item.publish_at)}</span></p></div>
          {item.next_action && <p className="mt-3 rounded-md bg-muted/60 px-2.5 py-2 text-[11px]"><span className="font-semibold">Next action:</span> <span className="text-muted-foreground">{item.next_action}</span></p>}
          {item.revision_notes && <p className="mt-2 line-clamp-2 border-l-2 border-primary/35 pl-2 text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Latest feedback:</span> {item.revision_notes}</p>}
          {item.assignee_name && <p className="mt-2 text-[10px] text-muted-foreground">Creator/editor: {item.assignee_name}</p>}
          <details className="mt-3 border-t pt-2">
            <summary className="cursor-pointer text-xs font-semibold text-primary">Files &amp; review</summary>
            <ClientFiles clientId={item.client_id} contentItemId={item.id} canUpload={canEdit} />
          </details>
        </article>)}
      </div>}
    </section>
    <p className="mt-3 text-[10px] text-muted-foreground">This view shows content for clients you can access. Creator assignment is shown separately on each item.</p>
  </main>
}

export function ContentTracker({ clients, campaigns, assignees, items, canCreate, canEdit, notice, importedCount, skippedCount, workView = false }: {
  clients: TrackerClient[]; campaigns: TrackerCampaign[]; assignees: Record<string, TrackerAssignee[]>; items: TrackerItem[]; canCreate: boolean; canEdit: boolean; notice?: string; importedCount?: number; skippedCount?: number; workView?: boolean
}) {
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [clientFilter, setClientFilter] = useState("all")
  const visibleItems = useMemo(() => items.filter((item) => {
    const text = `${item.title} ${item.client_name} ${item.campaign_name} ${item.platform} ${item.content_type} ${item.status} ${item.client_approval_status ?? ""} ${item.client_issues ?? ""} ${item.notes ?? ""} ${item.revision_notes ?? ""} ${item.assignee_name ?? ""}`.toLocaleLowerCase()
    return (!query || text.includes(query.trim().toLocaleLowerCase())) && (statusFilter === "all" || item.status === statusFilter) && (clientFilter === "all" || item.client_id === clientFilter)
  }), [items, query, statusFilter, clientFilter])
  const notices: Record<string, string> = { created: "Content added to the tracker.", updated: "Content updated.", archived: "Content moved out of the active tracker.", imported: `${importedCount ?? 0} content rows imported; ${skippedCount ?? 0} duplicates skipped.`, import_too_large: "CSV file exceeds the 1 MB limit.", invalid_import: "CSV import failed validation. Review the row preview and required columns.", content_migration_missing: "Apply the local content workflow alignment migration under supabase/migrations, then refresh.", invalid: "Check the required fields and try again.", failed: "The change could not be saved. Refresh and try again.", forbidden: "Your account does not have permission for that change." }

  if (workView) return <MyContentWorklist clients={clients} items={items} canEdit={canEdit} />

  return <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">Marketing operations</p><h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Content tracker</h1><p className="mt-1 text-xs text-muted-foreground">Track production, revisions, and publishing dates by client.</p></div>
      <div className="text-right"><p className="text-lg font-semibold tabular-nums">{items.length}</p><p className="text-[11px] text-muted-foreground">active content items</p></div>
    </div>
    {notice && notices[notice] && <p role="status" className="mt-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">{notices[notice]}</p>}
    {canCreate && <details className="group mt-4 rounded-lg border border-border bg-card/80 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><Plus className="size-4 text-primary" />Add content</span><span className="text-[11px] font-normal text-muted-foreground">Create one planned post or creative item</span></summary>
      <div className="mt-3 border-t pt-3">{clients.length && campaigns.length ? <ContentForm clients={clients} campaigns={campaigns} assignees={assignees} canEdit={canCreate} /> : <p className="text-xs text-muted-foreground">Add an active client and campaign before adding tracked content.</p>}</div>
    </details>}
    {canCreate && <ContentImport clients={clients} campaigns={campaigns} assignees={assignees} items={items} />}
    <section className="mt-4 rounded-lg border border-border bg-card/75">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <label className="relative min-w-52 flex-1"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input className={`${fieldClass} pl-8`} aria-label="Search content" placeholder="Search content, client, platform" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select className={`${fieldClass} w-auto min-w-36`} aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>
        <select className={`${fieldClass} w-auto min-w-36`} aria-label="Filter by client" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}><option value="all">All clients</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
      </div>
      {!visibleItems.length ? <div className="px-4 py-12 text-center"><p className="text-sm font-medium">{items.length ? "No matching content" : "No content tracked yet"}</p><p className="mt-1 text-xs text-muted-foreground">{items.length ? "Try a different search or filter." : "Add the team’s upcoming posts and creative deliverables here."}</p></div> : <div className="divide-y">
        {visibleItems.map((item) => <article key={item.id} className="p-3 sm:p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_150px_auto] lg:items-center">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.title}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{item.client_name} <span className="px-1">·</span> {item.campaign_name} <span className="px-1">·</span> {item.platform} / {item.content_type}</p>{item.next_action && <p className="mt-1 truncate text-[11px]">Next: <span className="text-muted-foreground">{item.next_action}</span></p>}</div>
            <span className="w-fit rounded-md border border-primary/15 bg-primary/5 px-2 py-1 text-[11px] font-medium">{statusLabels[item.status] ?? item.status}</span>
            <div><p className="text-xs font-medium">Publish: {formatDate(item.publish_at)}</p><p className="text-[10px] text-muted-foreground">Deadline: {formatDate(item.deadline_at)}{item.work_date ? ` · Work: ${formatDate(item.work_date)}` : ""}</p><p className="text-[10px] text-muted-foreground">{item.revision_count} revision{item.revision_count === 1 ? "" : "s"}</p></div>
            {canEdit && <details className="relative"><summary className="cursor-pointer list-none text-xs font-medium text-primary underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">Edit</summary><div className="overview-panel absolute right-0 z-20 mt-2 w-[min(48rem,calc(100vw-2.5rem))] rounded-lg border bg-card p-3 shadow-xl"><ContentForm clients={clients.filter((client) => client.id === item.client_id)} campaigns={campaigns.filter((campaign) => campaign.client_id === item.client_id)} assignees={assignees} item={item} canEdit={canEdit} /><form action={archiveContentItem} className="mt-3 border-t pt-3"><input type="hidden" name="id" value={item.id} /><button className="flex items-center gap-1.5 text-xs text-destructive" type="submit"><Archive className="size-3.5" />Archive item</button></form></div></details>}
          </div>
          {item.assignee_name && <p className="mt-1 text-[11px] text-muted-foreground">Assigned to {item.assignee_name}</p>}
          {(item.client_approval_status || item.client_issues || item.notes) && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">{item.client_approval_status && <p>Client approval: <span className="font-medium text-foreground">{approvalLabels[item.client_approval_status] ?? item.client_approval_status}</span></p>}{item.client_issues && <p>Client issues: {item.client_issues}</p>}{item.notes && <p>Notes: {item.notes}</p>}</div>}
          {item.revision_notes && <p className="mt-3 border-l-2 border-primary/35 pl-2 text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Latest feedback:</span> {item.revision_notes}</p>}
        </article>)}
      </div>}
    </section>
    <p className="mt-3 text-[10px] text-muted-foreground">Adding a content item does not create a task automatically. Schedule dates appear on the calendar.</p>
  </main>
}
