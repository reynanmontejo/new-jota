"use client"

import { useMemo, useState } from "react"
import { Archive, CalendarDays, Megaphone, Search } from "lucide-react"

import { archiveCampaign, saveCampaign } from "@/app/clients/campaign-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { CampaignPermissions } from "@/lib/supabase/campaign-admin"

export type CampaignRecord = {
  id: string
  client_id: string
  name: string
  description: string | null
  status: "draft" | "active" | "paused" | "completed" | "cancelled"
  start_date: string | null
  end_date: string | null
}

const statuses: CampaignRecord["status"][] = ["draft", "active", "paused", "completed", "cancelled"]
const labels: Record<CampaignRecord["status"], string> = {
  draft: "Draft", active: "Active", paused: "Paused", completed: "Completed", cancelled: "Cancelled",
}
const fieldClass = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
const labelClass = "grid gap-1.5 text-[11px] font-medium text-muted-foreground"

const notices: Record<string, string> = {
  created: "Campaign created.",
  updated: "Campaign updated.",
  archived: "Campaign archived and removed from active selectors.",
  duplicate: "A campaign with that name already exists for this client.",
  invalid: "Check the campaign name and date range, then try again.",
  not_found: "That campaign is no longer available in this client workspace.",
  forbidden: "Your account does not have permission for that campaign change.",
  migration_missing: "Apply migration 202610070001_campaign_management.sql before managing campaigns.",
  failed: "The change could not be saved. Refresh and try again.",
}

function CampaignFields({ campaign, clientId }: { campaign?: CampaignRecord; clientId: string }) {
  return <>
    <input type="hidden" name="clientId" value={clientId} />
    {campaign && <input type="hidden" name="id" value={campaign.id} />}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>Campaign name<input className={fieldClass} name="name" defaultValue={campaign?.name ?? ""} required minLength={2} maxLength={160} placeholder="e.g. Holiday launch" /></label>
      <label className={labelClass}>Status<select className={fieldClass} name="status" defaultValue={campaign?.status ?? "draft"}>{statuses.map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select></label>
      <label className={labelClass}>Start date<input className={fieldClass} type="date" name="startDate" defaultValue={campaign?.start_date ?? ""} /></label>
      <label className={labelClass}>End date<input className={fieldClass} type="date" name="endDate" defaultValue={campaign?.end_date ?? ""} /></label>
    </div>
    <label className={labelClass}>Description<textarea className="min-h-16 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" name="description" maxLength={5000} defaultValue={campaign?.description ?? ""} placeholder="Objectives, scope, and important context" /></label>
  </>
}

export function CampaignManager({ clientId, campaigns, permissions, notice }: {
  clientId: string
  campaigns: CampaignRecord[]
  permissions: CampaignPermissions
  notice?: string
}) {
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<CampaignRecord["status"] | "all">("all")
  const visibleCampaigns = useMemo(() => campaigns.filter((campaign) => {
    const matchesText = `${campaign.name} ${campaign.description ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    return matchesText && (statusFilter === "all" || campaign.status === statusFilter)
  }), [campaigns, query, statusFilter])

  return <section aria-labelledby="campaigns-heading" className="mt-6 border-t border-border/70 pt-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="campaigns-heading" className="text-base font-semibold">Campaigns</h2><p className="mt-1 text-xs text-muted-foreground">Manage this client’s campaign scope, dates, and lifecycle.</p></div>
      {permissions.canCreate && <details className="group relative">
        <summary className="flex h-8 cursor-pointer list-none items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground [&::-webkit-details-marker]:hidden">New campaign</summary>
        <form action={saveCampaign} className="overview-panel absolute right-0 z-20 mt-2 grid w-[min(34rem,calc(100vw-2.5rem))] gap-3 rounded-lg border bg-card p-4 shadow-xl">
          <CampaignFields clientId={clientId} />
          <Button type="submit" size="sm">Create campaign</Button>
        </form>
      </details>}
    </div>
    {notice && notices[notice] && <p role="status" className={`mt-3 rounded-md border px-3 py-2 text-xs ${["created", "updated", "archived"].includes(notice) ? "border-emerald-700/15 bg-emerald-700/8 text-emerald-800 dark:text-emerald-300" : "border-amber-700/15 bg-amber-700/8 text-amber-900 dark:text-amber-200"}`}>{notices[notice]}</p>}
    {!campaigns.length ? <p className="mt-4 rounded-md border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">No campaigns for this client yet.{permissions.canCreate ? " Create one to start organizing its work." : " Ask a workspace manager to create one."}</p> : <>
      <div className="mt-4 flex flex-wrap gap-2">
        <label className="relative min-w-48 flex-1"><Search aria-hidden="true" className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input className={`${fieldClass} pl-8`} aria-label="Search campaigns" placeholder="Search campaigns" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select className={`${fieldClass} w-auto min-w-32`} aria-label="Filter campaigns by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CampaignRecord["status"] | "all")}><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select>
      </div>
      {!visibleCampaigns.length ? <p className="mt-3 rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">No campaigns match the search or status filter.</p> :
      <div className="mt-4 divide-y overflow-hidden rounded-lg border border-border">
        {visibleCampaigns.map((campaign) => <article key={campaign.id} className="bg-card/55 p-3 sm:p-4">
          <div className="flex flex-wrap items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/8 text-primary"><Megaphone aria-hidden="true" className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{campaign.name}</h3><Badge variant="outline" className="h-5 px-1.5 text-[10px]">{labels[campaign.status]}</Badge></div>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{campaign.description || "No campaign description."}</p>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"><CalendarDays aria-hidden="true" className="size-3.5" />{campaign.start_date || "Start date not set"} – {campaign.end_date || "End date not set"}</p>
            </div>
            {permissions.canUpdate && <details className="relative">
              <summary className="cursor-pointer rounded-md border px-2.5 py-1.5 text-[11px] font-medium text-primary [&::-webkit-details-marker]:hidden">Edit</summary>
              <form action={saveCampaign} className="overview-panel absolute right-0 z-20 mt-2 grid w-[min(34rem,calc(100vw-2.5rem))] gap-3 rounded-lg border bg-card p-4 shadow-xl">
                <CampaignFields campaign={campaign} clientId={clientId} />
                <Button type="submit" size="sm">Save changes</Button>
              </form>
            </details>}
          </div>
          {permissions.canArchive && <details className="mt-3 border-t border-border/70 pt-2.5">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-medium text-destructive [&::-webkit-details-marker]:hidden"><Archive aria-hidden="true" className="size-3.5" />Archive campaign</summary>
            <form action={archiveCampaign} className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-destructive/15 bg-destructive/5 p-2.5">
              <input type="hidden" name="clientId" value={clientId} /><input type="hidden" name="id" value={campaign.id} />
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground"><input type="checkbox" name="confirmArchive" value="yes" required />Remove from active campaign lists</label>
              <Button type="submit" size="sm" variant="destructive">Confirm archive</Button>
            </form>
          </details>}
        </article>)}
      </div>}
    </>}
  </section>
}
