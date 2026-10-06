import Link from "next/link"
import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, ListTodo } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ContentCalendar, type ContentCalendarPost } from "@/features/calendar/content-calendar"
import { CampaignManager, type CampaignRecord } from "@/features/clients/campaign-manager"
import { ClientTaskList } from "@/features/clients/client-task-list"
import { ClientFiles } from "@/features/clients/client-files"
import { moveClientToTrash, updateClientAccountManagers, updateClientStatus } from "@/app/clients/actions"
import type { CampaignPermissions } from "@/lib/supabase/campaign-admin"

export type ClientRecord = {
  id: string
  name: string
  description: string | null
  website_url: string | null
  social_platforms: string[]
  status: "active" | "paused" | "archived"
  campaignCount: number
  openTaskCount: number
}

const statusStyle: Record<ClientRecord["status"], string> = {
  active: "border-emerald-700/15 bg-emerald-700/8 text-emerald-800 dark:text-emerald-300",
  paused: "border-amber-700/15 bg-amber-700/8 text-amber-800 dark:text-amber-300",
  archived: "border-border bg-muted text-muted-foreground",
}

export type ClientTeamMember = { id: string; name: string; jobTitle: string | null; role: string; isPrimary: boolean; avatarUrl: string | null }
export type AssignableAccountManager = { id: string; name: string; jobTitle: string | null }
export type ClientActivityItem = { id: string; action: string; entity: string; actor: string; createdAt: string }

const tabs = ["overview", "campaigns", "calendar", "tasks", "files", "team", "activity"] as const
type ClientTab = (typeof tabs)[number]

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function ClientRecordView({ client, activeTab = "overview", campaigns = [], campaignPermissions = { canCreate: false, canUpdate: false, canArchive: false }, contentPosts = [], team = [], assignableAccountManagers = [], canManageAssignments = false, canManageStatus = false, canManageTrash = false, activity = [], contentError = false, notice }: {
  client: ClientRecord
  activeTab?: ClientTab
  campaigns?: CampaignRecord[]
  campaignPermissions?: CampaignPermissions
  contentPosts?: ContentCalendarPost[]
  team?: ClientTeamMember[]
  assignableAccountManagers?: AssignableAccountManager[]
  canManageAssignments?: boolean
  canManageStatus?: boolean
  canManageTrash?: boolean
  activity?: ClientActivityItem[]
  contentError?: boolean
  notice?: string
}) {
  const today = localDateKey(new Date())
  const nextScheduledPost = contentPosts
    .filter((post) => post.status === "scheduled" && post.date.slice(0, 10) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <Link href="/clients" className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground transition hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-3.5" /> All clients
      </Link>

      <nav aria-label="Client workspace" className="mt-4 flex gap-1 overflow-x-auto border-b border-border/80">
        {tabs.map((tab) => <Link key={tab} href={`/clients/${encodeURIComponent(client.id)}${tab === "overview" ? "" : `?tab=${tab}`}`} aria-current={activeTab === tab ? "page" : undefined} className={`shrink-0 border-b-2 px-3 py-2 text-xs font-medium capitalize transition ${activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{tab === "files" ? "Files" : tab}</Link>)}
      </nav>

      {(canManageStatus || canManageTrash) && <section aria-label="Client lifecycle actions" className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-md border border-border/80 bg-card/65 p-3">
        {canManageStatus && <form action={updateClientStatus} className="flex flex-wrap items-end gap-2"><input type="hidden" name="clientId" value={client.id} /><label className="grid gap-1 text-[10px] font-medium text-muted-foreground">Client status<select className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground" name="status" defaultValue={client.status}><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label><Button type="submit" size="sm" variant="outline" className="h-8">Save status</Button></form>}
        {canManageTrash && <details className="group relative"><summary className="flex h-8 cursor-pointer list-none items-center rounded-md border border-destructive/25 px-3 text-xs font-medium text-destructive hover:bg-destructive/5 [&::-webkit-details-marker]:hidden">Move to Trash</summary><div className="absolute right-0 z-20 mt-2 w-64 rounded-md border bg-card p-3 shadow-lg"><p className="text-xs font-medium">This hides the client but keeps its tasks, campaigns, content, and history.</p><p className="mt-1 text-[10px] text-muted-foreground">A Supervisor or Administrator can restore it from Clients → Trash. Permanent deletion is not available.</p><form action={moveClientToTrash} className="mt-3"><input type="hidden" name="clientId" value={client.id} /><Button type="submit" variant="destructive" size="sm">Confirm move to Trash</Button></form></div></details>}
      </section>}
      {notice === "status-updated" && <p role="status" className="mt-3 rounded-md border border-emerald-700/15 bg-emerald-700/8 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">Client status updated.</p>}
      {notice?.startsWith("status-") && notice !== "status-updated" && <p role="alert" className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">Could not update the client status. Check your access and try again.</p>}
      {notice?.startsWith("trash-") && <p role="alert" className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">Could not move this client to Trash. Check your access and try again.</p>}

      <section className="mt-4 rounded-lg border border-border bg-card/85 p-5 shadow-[0_8px_24px_-22px_rgb(78_58_36/55%)] sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-md border border-primary/15 bg-primary/8 text-sm font-semibold text-primary">
            {client.name.trim().slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{client.name}</h1>
              <Badge variant="outline" className={`h-5 px-1.5 text-[10px] capitalize ${statusStyle[client.status]}`}>{client.status}</Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {client.description || "Client account workspace."}
            </p>
            {client.website_url && (
              <a href={client.website_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                {client.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </a>
            )}
            {client.social_platforms.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Platforms: <span className="font-medium text-foreground">{client.social_platforms.join(", ")}</span></p>}
          </div>
        </div>

        {activeTab === "overview" ? <div className="mt-6 grid gap-3 border-t border-border/70 pt-5 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-md border border-border/80 bg-background/65 p-3.5">
            <span className="grid size-9 place-items-center rounded-md bg-primary/8 text-primary"><BriefcaseBusiness aria-hidden="true" className="size-4" /></span>
            <span><span className="block text-lg font-semibold leading-5">{client.campaignCount}</span><span className="text-[11px] text-muted-foreground">Campaigns</span></span>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-border/80 bg-background/65 p-3.5">
            <span className="grid size-9 place-items-center rounded-md bg-primary/8 text-primary"><ListTodo aria-hidden="true" className="size-4" /></span>
            <span><span className="block text-lg font-semibold leading-5">{client.openTaskCount}</span><span className="text-[11px] text-muted-foreground">Open tasks</span></span>
          </div>
        </div> : activeTab === "campaigns" ? (
          <CampaignManager clientId={client.id} campaigns={campaigns} permissions={campaignPermissions} notice={notice} />
        ) : activeTab === "calendar" ? (
          <div className="mt-4 border-t border-border/70 pt-4"><ContentCalendar clientId={client.id} contentPosts={contentPosts} contentError={contentError} /></div>
        ) : activeTab === "tasks" ? (
          <div className="mt-4 border-t border-border/70 pt-4"><ClientTaskList clientId={client.id} /></div>
        ) : activeTab === "team" ? (
          <section aria-labelledby="client-team-heading" className="mt-6 border-t border-border/70 pt-5"><h2 id="client-team-heading" className="text-sm font-semibold">Client team</h2><p className="mt-1 text-xs text-muted-foreground">People currently assigned to this client. Roster changes are managed by a workspace administrator.</p>{team.length ? <ul className="mt-3 divide-y rounded-md border">{team.map((member) => <li key={member.id} className="flex items-center gap-3 p-3"><span className="grid size-8 place-items-center rounded-full bg-secondary/35 text-[10px] font-semibold text-primary">{member.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{member.name}{member.isPrimary ? " · Primary" : ""}</span><span className="text-[10px] text-muted-foreground">{member.jobTitle || member.role}</span></span><Badge variant="outline" className="text-[10px] capitalize">{member.role.replaceAll("_", " ")}</Badge></li>)}</ul> : <p className="mt-3 rounded-md border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">No active client team members are available.</p>}</section>
        ) : activeTab === "activity" ? (
          <section aria-labelledby="client-activity-heading" className="mt-6 border-t border-border/70 pt-5"><h2 id="client-activity-heading" className="text-sm font-semibold">Recent activity</h2><p className="mt-1 text-xs text-muted-foreground">Activity you are permitted to see in this client workspace.</p>{activity.length ? <ol className="mt-3 divide-y rounded-md border">{activity.map((item) => <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 p-3"><span><span className="block text-xs font-medium">{item.action} · {item.entity}</span><span className="mt-1 block text-[10px] text-muted-foreground">{item.actor}</span></span><time className="text-[10px] text-muted-foreground" dateTime={item.createdAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></li>)}</ol> : <p className="mt-3 rounded-md border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">No activity is available for this client yet.</p>}</section>
        ) : activeTab === "files" ? (
          <ClientFiles clientId={client.id} />
        ) : null}
      </section>

      {activeTab === "overview" && <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(240px,.6fr)]"><div><div className="mb-2 flex items-end justify-between gap-2"><div><h2 className="text-sm font-semibold">Recent tasks</h2><p className="text-[11px] text-muted-foreground">Open assigned work for {client.name}.</p></div><Link href={`/clients/${encodeURIComponent(client.id)}?tab=tasks`} className="text-[11px] font-medium text-primary hover:underline">All tasks</Link></div><ClientTaskList clientId={client.id} limit={4} /></div><aside className="rounded-lg border border-border bg-card/65 p-4"><h2 className="text-sm font-semibold">Next scheduled content</h2>{nextScheduledPost ? <><p className="mt-3 text-xs font-medium">{nextScheduledPost.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{nextScheduledPost.channel} · {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(nextScheduledPost.date))}</p><Link href={`/clients/${encodeURIComponent(client.id)}?tab=calendar`} className="mt-3 inline-flex text-[11px] font-medium text-primary hover:underline">Open client calendar</Link></> : <p className="mt-2 text-xs text-muted-foreground">No upcoming scheduled content.</p>}</aside></section>}
      {activeTab === "team" && canManageAssignments && <form action={updateClientAccountManagers} className="mt-4 grid gap-3 rounded-md border bg-background/60 p-3">
        <input type="hidden" name="clientId" value={client.id} />
        <div><h3 className="text-xs font-semibold">Manage Account Managers</h3><p className="mt-1 text-[10px] text-muted-foreground">A supervisor or administrator can select one or more active managers and choose the primary owner. The primary manager must also be checked above.</p></div>
        {assignableAccountManagers.length ? <>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Account Managers assigned to this client</legend>
            {assignableAccountManagers.map((manager, index) => <label key={manager.id} className="flex min-w-0 items-center gap-2 rounded border px-2.5 py-2 text-xs"><input className="size-3.5 accent-primary" type="checkbox" name="accountManagerIds" value={manager.id} defaultChecked={team.some((member) => member.id === manager.id && member.role === "account_manager") || (index === 0 && !team.some((member) => member.role === "account_manager"))} /><span className="min-w-0"><span className="block truncate font-medium">{manager.name}</span>{manager.jobTitle && <span className="block truncate text-[10px] text-muted-foreground">{manager.jobTitle}</span>}</span></label>)}
          </fieldset>
          <label className="grid gap-1 text-[11px] font-medium">Primary Account Manager<select className="h-9 rounded-md border border-input bg-background px-2.5 text-xs" name="primaryAccountManagerId" defaultValue={team.find((member) => member.isPrimary && member.role === "account_manager")?.id ?? assignableAccountManagers[0].id} required>
            {assignableAccountManagers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
          </select></label>
          <Button type="submit" size="sm" className="justify-self-start">Save assignments</Button>
        </> : <p className="text-xs text-muted-foreground">No active Account Manager accounts are available to assign.</p>}
      </form>}
      {activeTab === "team" && notice === "assignments-updated" && <p role="status" className="mt-3 rounded-md border border-emerald-700/15 bg-emerald-700/8 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">Account Manager assignments saved.</p>}
      {activeTab === "team" && notice?.startsWith("assignment-") && notice !== "assignments-updated" && <p role="alert" className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">Could not save Account Manager assignments. Check your selection and permissions, then try again.</p>}
    </main>
  )
}
