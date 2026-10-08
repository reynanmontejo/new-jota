"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import Image from "next/image"
import { ArrowUpRight, Download, ExternalLink, FileText, Film, Play, Search, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createClientRecord, restoreClientFromTrash } from "@/app/clients/actions"

export type ClientDirectoryItem = {
  id: string
  name: string
  description: string | null
  website_url: string | null
  social_platforms: string[]
  status: "active" | "paused" | "archived"
  campaignCount: number
  openTaskCount: number
  primaryAccountManager: { id: string; name: string } | null
  accountManagers?: Array<{ id: string; name: string; isPrimary: boolean }>
}

const filters = ["all", "active", "paused", "archived"] as const
type Filter = (typeof filters)[number]
export type TrashedClientItem = Pick<ClientDirectoryItem, "id" | "name" | "description" | "status"> & { deleted_at: string }
type RecentClientFile = { id: string; clientId: string; clientName: string; canBrowseClient?: boolean; fileName: string; mimeType: string; sizeBytes: number; createdAt: string; taskId: string | null }
const socialPlatforms = ["Instagram", "Facebook", "TikTok", "LinkedIn", "YouTube", "X", "Pinterest", "Threads", "Snapchat"]
const imagePreviewTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
const videoPreviewTypes = new Set(["video/mp4", "video/webm", "video/quicktime"])

function RecentFileThumbnail({ file, fileUrl }: { file: RecentClientFile; fileUrl: string }) {
  const [failed, setFailed] = useState(false)
  const image = imagePreviewTypes.has(file.mimeType.toLowerCase())
  const video = videoPreviewTypes.has(file.mimeType.toLowerCase())

  return <a href={fileUrl} target="_blank" rel="noreferrer" aria-label={`Preview ${file.fileName}`} title={`Preview ${file.fileName}`} className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border border-border/70 bg-muted/35 text-primary">
    {image && !failed ? <Image src={fileUrl} alt={`Thumbnail: ${file.fileName}`} width={112} height={112} unoptimized onError={() => setFailed(true)} className="size-full object-cover" />
      : video && !failed ? <><video src={fileUrl} muted playsInline preload="metadata" onError={() => setFailed(true)} className="size-full bg-black object-cover" /><span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-black/15 text-white"><Play className="size-4 fill-current drop-shadow" /></span></>
        : video ? <Film aria-hidden="true" className="size-5" /> : <FileText aria-hidden="true" className="size-5" />}
  </a>
}

const statusClass: Record<ClientDirectoryItem["status"], string> = {
  active: "border-emerald-700/15 bg-emerald-700/8 text-emerald-800 dark:text-emerald-300",
  paused: "border-amber-700/15 bg-amber-700/8 text-amber-800 dark:text-amber-300",
  archived: "border-border bg-muted text-muted-foreground",
}

const noticeText: Record<string, string> = {
  created: "Client added.",
  invalid: "Check the client name and website URL, then try again.",
  duplicate: "A client with that name already exists in this workspace.",
  "client-trashed": "Client moved to Trash. Its history is retained and it can be restored.",
  "client-restored": "Client restored.",
  "restore-failed": "The client couldn’t be restored. Refresh and try again.",
  "trash-failed": "The client couldn’t be moved to Trash. Refresh and try again.",
  "trash-forbidden": "You don’t have permission to manage Client Trash.",
  failed: "The client couldn’t be added. Refresh and try again.",
  forbidden: "You don’t have permission to add clients.",
}

export function ClientDirectory({ clients, recentFiles = [], trashedClients = [], canManageTrash = false, canCreate = false, notice, initialTab = "overview", initialView = "active" }: { clients: ClientDirectoryItem[]; recentFiles?: RecentClientFile[]; trashedClients?: TrashedClientItem[]; canManageTrash?: boolean; canCreate?: boolean; notice?: string; initialTab?: "overview" | "campaigns" | "files"; initialView?: "active" | "trash" }) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const counts = useMemo(() => ({
    all: clients.length,
    active: clients.filter((client) => client.status === "active").length,
    paused: clients.filter((client) => client.status === "paused").length,
    archived: clients.filter((client) => client.status === "archived").length,
  }), [clients])
  const visibleClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return clients.filter((client) => {
      const matchesStatus = filter === "all" || client.status === filter
      const searchable = `${client.name} ${client.description ?? ""} ${client.accountManagers?.map((manager) => manager.name).join(" ") ?? client.primaryAccountManager?.name ?? ""} ${client.social_platforms.join(" ")}`.toLocaleLowerCase()
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery)
      return matchesStatus && matchesQuery
    })
  }, [clients, filter, query])

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">Workspace</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{initialView === "trash" ? "Client Trash" : initialTab === "campaigns" ? "Campaigns" : initialTab === "files" ? "Client files" : "Clients"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{initialTab === "overview" ? "Client accounts and their workspaces." : initialTab === "files" ? "Recent uploads across your clients, with each client’s full file library below." : "Choose a client to open its campaigns workspace."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {initialTab === "files" && initialView === "active" && <Link href="/tasks/trash" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary/18 bg-background/75 px-3 text-xs font-medium text-muted-foreground transition hover:bg-background hover:text-foreground"><Trash2 className="size-3.5" /> Trash</Link>}
          <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-background/75 px-3 sm:w-72">
            <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <input
              aria-label="Search clients or account managers"
              className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-xs shadow-none outline-none focus-visible:ring-0"
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Search clients or account managers"
              value={query}
            />
          </div>
          {canCreate && (
            <details className="group relative">
              <summary className="flex h-9 cursor-pointer list-none items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition hover:brightness-105 [&::-webkit-details-marker]:hidden">Add client</summary>
              <form action={createClientRecord} className="absolute right-0 z-20 mt-2 grid max-h-[min(80vh,42rem)] w-[min(24rem,calc(100vw-2rem))] gap-3 overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-xl">
                <div><h2 className="text-sm font-semibold">New client</h2><p className="mt-1 text-[11px] text-muted-foreground">Create a client workspace for your team.</p></div>
                <label className="grid gap-1 text-[11px] font-medium">Client name <input className="h-9 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" name="name" required minLength={2} maxLength={140} placeholder="e.g. Northwind Coffee" /></label>
                <label className="grid gap-1 text-[11px] font-medium">Website <span className="font-normal text-muted-foreground">Optional; https:// only</span><input className="h-9 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" name="websiteUrl" type="url" pattern="https://.*" placeholder="https://example.com" /></label>
                <fieldset className="grid gap-2">
                  <legend className="text-[11px] font-medium">Social platforms <span className="font-normal text-muted-foreground">Select all used for this client</span></legend>
                  <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-2.5 sm:grid-cols-3">
                    {socialPlatforms.map((platform) => <label key={platform} className="flex items-center gap-2 text-[11px] font-normal"><input className="size-3.5 accent-primary" type="checkbox" name="platforms" value={platform} />{platform}</label>)}
                  </div>
                  <label className="grid gap-1 text-[10px] font-normal text-muted-foreground">Other platforms, comma-separated<input className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" name="customPlatforms" placeholder="e.g. Lemon8, Bluesky" /></label>
                </fieldset>
                <label className="grid gap-1 text-[11px] font-medium">Description <span className="font-normal text-muted-foreground">Optional</span><textarea className="min-h-20 resize-y rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" name="description" maxLength={2000} placeholder="A short account summary" /></label>
                <Button type="submit" size="sm" className="w-full">Create client</Button>
              </form>
            </details>
          )}
        </div>
      </div>

      {notice && noticeText[notice] && <p role="status" className={`mt-4 rounded-md border px-3 py-2 text-xs ${["created", "client-trashed", "client-restored"].includes(notice) ? "border-emerald-700/15 bg-emerald-700/8 text-emerald-800 dark:text-emerald-300" : "border-amber-700/15 bg-amber-700/8 text-amber-900 dark:text-amber-200"}`}>{noticeText[notice]}</p>}

      <nav aria-label="Client views" className="mt-4 flex gap-1 border-b border-border/80">
        <Link href="/clients" aria-current={initialView === "active" ? "page" : undefined} className={`px-3 py-2 text-xs font-medium ${initialView === "active" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Active clients</Link>
        {canManageTrash && <Link href="/clients?view=trash" aria-current={initialView === "trash" ? "page" : undefined} className={`px-3 py-2 text-xs font-medium ${initialView === "trash" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Trash <span className="ml-1 text-[10px] text-muted-foreground">{trashedClients.length}</span></Link>}
      </nav>

      {initialTab === "campaigns" && <p className="mt-4 rounded-md border border-primary/15 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">Select a client to open its campaigns section. Some workspace sections may be unavailable until they are connected for your account.</p>}

      {initialTab === "files" && initialView === "active" && <section aria-labelledby="recent-client-files" className="mt-4 rounded-lg border border-border bg-card/75 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3"><div><h2 id="recent-client-files" className="text-sm font-semibold">Recent files</h2><p className="mt-0.5 text-[11px] text-muted-foreground">Latest uploads from client and task workspaces you can access.</p></div><span className="rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{recentFiles.length}</span></div>
        {recentFiles.length ? <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{recentFiles.map((file) => {
          const canPreview = imagePreviewTypes.has(file.mimeType.toLowerCase()) || videoPreviewTypes.has(file.mimeType.toLowerCase()) || file.mimeType === "application/pdf"
          const fileUrl = `/api/files/${encodeURIComponent(file.id)}${canPreview ? "?inline=1" : ""}`
          const size = file.sizeBytes < 1024 * 1024 ? `${Math.max(1, Math.round(file.sizeBytes / 1024))} KB` : `${(file.sizeBytes / 1024 / 1024).toFixed(1)} MB`
          return <li key={file.id} className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-background/65 p-2">
            <RecentFileThumbnail file={file} fileUrl={fileUrl} />
            <div className="min-w-0 flex-1"><a href={fileUrl} target="_blank" rel="noreferrer" className="block truncate text-[11px] font-medium hover:text-primary hover:underline" title={file.fileName}>{file.fileName}</a><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{file.clientName}{file.taskId ? " · Task" : " · Client"} · {size} · {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(file.createdAt))}</p></div>
            <a href={fileUrl} target="_blank" rel="noreferrer" aria-label={`${canPreview ? "Preview" : "Download"} ${file.fileName}`} title={canPreview ? "Preview file" : "Download file"} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">{canPreview ? <ExternalLink className="size-3.5" /> : <Download className="size-3.5" />}</a>
            {file.canBrowseClient !== false && <Link href={`/clients/${encodeURIComponent(file.clientId)}?tab=files`} aria-label={`Browse ${file.clientName} files`} title={`Browse ${file.clientName} files`} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowUpRight className="size-3.5" /></Link>}
          </li>
        })}</ul> : <p className="mt-2 rounded-md border border-dashed px-3 py-4 text-center text-[11px] text-muted-foreground">No recent files yet. Files uploaded to your accessible client and task workspaces will appear here.</p>}
      </section>}

      {initialView === "active" && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
        <div className="flex flex-wrap gap-1.5" aria-label="Filter clients by status">
          {filters.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${filter === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {option} <span className="ml-1 opacity-75">{counts[option]}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">{visibleClients.length} {visibleClients.length === 1 ? "client" : "clients"}</p>
      </div>}

      {initialView === "trash" ? (
        trashedClients.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-border bg-card/55 px-5 py-14 text-center"><h2 className="text-sm font-semibold">Trash is empty</h2><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Moved clients appear here. Their related history is kept, with no automatic permanent deletion.</p></div>
        ) : (
          <ul className="mt-4 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {trashedClients.map((client) => <li key={client.id} className="rounded-lg border border-border bg-card/85 p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{client.name}</h2><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{client.description || "Client workspace"}</p></div><Badge variant="outline" className="shrink-0 text-[10px]">In Trash</Badge></div>
              <p className="mt-3 text-[10px] text-muted-foreground">Moved {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(client.deleted_at))} · Previous status: {client.status}</p>
              <form action={restoreClientFromTrash} className="mt-3 border-t border-border/70 pt-3"><input type="hidden" name="clientId" value={client.id} /><Button type="submit" size="sm" variant="outline">Restore client</Button></form>
            </li>)}
          </ul>
        )
      ) : visibleClients.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-border bg-card/55 px-5 py-14 text-center">
          <h2 className="text-sm font-semibold">{clients.length === 0 ? "No clients yet" : "No matching clients"}</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            {clients.length === 0 ? "Client accounts will appear here when they’re added to your workspace." : "Try another name or status filter."}
          </p>
          {(query || filter !== "all") && clients.length > 0 && <button type="button" className="mt-3 text-xs font-medium text-primary hover:underline" onClick={() => { setQuery(""); setFilter("all") }}>Clear search and filters</button>}
        </div>
      ) : (
        <ul className="mt-4 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {visibleClients.map((client) => (
            <li key={client.id}>
              <Link
                href={`/clients/${encodeURIComponent(client.id)}${initialTab === "overview" ? "" : `?tab=${initialTab}`}`}
                className="group block h-full rounded-lg border border-border bg-card/85 p-4 shadow-[0_8px_24px_-22px_rgb(78_58_36/55%)] transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_16px_32px_-24px_rgb(78_58_36/55%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-md border border-primary/15 bg-primary/8 text-xs font-semibold text-primary">
                    {client.name.trim().slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{client.name}</span>
                      <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <Badge variant="outline" className={`h-5 px-1.5 text-[10px] capitalize ${statusClass[client.status]}`}>{client.status}</Badge>
                      {client.website_url && <span className="truncate text-[10px] text-muted-foreground">{client.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>}
                    </span>
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">{client.description || "Open this client workspace to view its work and account details."}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">Account manager{(client.accountManagers?.length ?? 0) === 1 ? "" : "s"}: <span className="font-medium text-foreground">{client.accountManagers?.length ? client.accountManagers.map((manager) => `${manager.name}${manager.isPrimary ? " (primary)" : ""}`).join(", ") : client.primaryAccountManager?.name ?? "Unassigned"}</span></p>
                {client.social_platforms.length > 0 && <p className="mt-2 truncate text-[10px] text-muted-foreground">Platforms: <span className="font-medium text-foreground">{client.social_platforms.join(", ")}</span></p>}
                <span className="mt-4 flex items-center gap-4 border-t border-border/70 pt-3 text-[11px] text-muted-foreground">
                  <span><strong className="font-semibold text-foreground">{client.campaignCount}</strong> campaigns</span>
                  <span><strong className="font-semibold text-foreground">{client.openTaskCount}</strong> open tasks</span>
                  <span className="ml-auto font-medium text-primary">{initialTab === "overview" ? "View client" : `View ${initialTab === "campaigns" ? "campaigns" : "files"}`}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
