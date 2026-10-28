"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { ArrowUpRight, Download, Eye, FileText, Film, LoaderCircle, MoreHorizontal, Play, Search, Trash2, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createClientRecord, restoreClientFromTrash } from "@/app/clients/actions"
import { CreateClientSubmitButton } from "@/features/clients/create-client-submit-button"
import { getPreviewMimeType } from "@/lib/storage/preview-types"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

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
type RecentClientFile = { id: string; clientId: string; clientName: string; canBrowseClient?: boolean; canTrash?: boolean; fileName: string; mimeType: string; sizeBytes: number; createdAt: string; taskId: string | null }
const socialPlatforms = ["Instagram", "Facebook", "TikTok", "LinkedIn", "YouTube", "X", "Pinterest", "Threads", "Snapchat"]
const imagePreviewTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
const videoPreviewTypes = new Set(["video/mp4", "video/webm", "video/quicktime"])

const INITIAL_RECENT_FILE_COUNT = 6

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function RecentFileCard({ file, onOpen, onTrash, busy }: { file: RecentClientFile; onOpen: () => void; onTrash: (file: RecentClientFile) => void; busy: boolean }) {
  const [failed, setFailed] = useState(false)
  const previewMimeType = getPreviewMimeType(file.mimeType, file.fileName)
  const image = previewMimeType?.startsWith("image/") ?? false
  const video = previewMimeType?.startsWith("video/") ?? false
  const fileUrl = `/api/files/${encodeURIComponent(file.id)}?inline=1`

  return <li className="min-w-0">
    <div className="group relative min-w-0 rounded-lg border border-border/70 bg-background/65 p-2 transition hover:border-primary/35 hover:bg-background">
      <button type="button" onClick={onOpen} aria-label={`Review ${file.fileName}`} title={`Review ${file.fileName}`} className="block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-md border border-border/60 bg-muted/35 text-primary">
          {image && !failed ? <Image src={fileUrl} alt={`Thumbnail: ${file.fileName}`} fill sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px" unoptimized onError={() => setFailed(true)} className="object-cover transition group-hover:scale-[1.02]" />
            : video && !failed ? <><video src={fileUrl} muted playsInline preload="metadata" onError={() => setFailed(true)} className="size-full bg-black object-cover" /><span aria-hidden="true" className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-full bg-foreground/80 text-background"><Play className="ml-0.5 size-3.5 fill-current" /></span></>
              : video ? <Film aria-hidden="true" className="size-8" />
              : <FileText aria-hidden="true" className="size-8" />}
        </span>
        <span className="mt-2 block truncate pr-7 text-[11px] font-medium group-hover:text-primary" title={file.fileName}>{file.fileName}</span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{file.clientName} · {formatFileSize(file.sizeBytes)}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label={`Actions for ${file.fileName}`} className="absolute right-2 top-2 z-10 rounded-full bg-background/90 text-muted-foreground shadow-sm" />}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44 rounded-lg p-1.5">
          <DropdownMenuItem onClick={onOpen} className="min-h-8 rounded-md px-2 text-xs"><Eye className="size-3.5" />Preview</DropdownMenuItem>
          <DropdownMenuItem render={<a href={`/api/files/${encodeURIComponent(file.id)}`} />} className="min-h-8 rounded-md px-2 text-xs"><Download className="size-3.5" />Download</DropdownMenuItem>
          {file.canBrowseClient && <DropdownMenuItem render={<Link href={`/clients/${encodeURIComponent(file.clientId)}?tab=files`} />} className="min-h-8 rounded-md px-2 text-xs"><ArrowUpRight className="size-3.5" />Open client files</DropdownMenuItem>}
          {file.canTrash && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => onTrash(file)} disabled={busy} className="min-h-8 rounded-md px-2 text-xs text-destructive focus:text-destructive">{busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}Move to Trash</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </li>
}

function RecentFilePreview({ file, onClose }: { file: RecentClientFile; onClose: () => void }) {
  const [previewFailed, setPreviewFailed] = useState(false)
  const [previewError, setPreviewError] = useState("")
  const mimeType = getPreviewMimeType(file.mimeType, file.fileName) ?? file.mimeType.toLowerCase()
  const fileUrl = `/api/files/${encodeURIComponent(file.id)}?inline=1`
  const isImage = imagePreviewTypes.has(mimeType)
  const isVideo = videoPreviewTypes.has(mimeType)
  const isPdf = mimeType === "application/pdf"

  async function inspectPreviewFailure() {
    setPreviewFailed(true)
    try {
      const response = await fetch(fileUrl, { cache: "no-store" })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        setPreviewError(payload?.error ?? `Preview request failed (${response.status}).`)
      } else {
        setPreviewError(`The file endpoint returned ${response.headers.get("content-type") ?? "an unknown file type"}, which this browser could not display as ${mimeType}.`)
      }
    } catch {
      setPreviewError("The browser could not reach the private file preview endpoint.")
    }
  }

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [onClose])

  return createPortal(<div role="dialog" aria-modal="true" aria-label={`File preview: ${file.fileName}`} onClick={onClose} className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-3 sm:p-6">
    <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/15 bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex min-w-0 items-center gap-3 border-b px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.fileName}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{file.clientName} · {formatFileSize(file.sizeBytes)}</p></div><a href={`/api/files/${encodeURIComponent(file.id)}`} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-muted"><Download className="size-3.5" />Download</a><button type="button" onClick={onClose} aria-label="Close preview" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button></div>
      <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-black/5 p-2 sm:p-4">
        {previewFailed ? <div className="max-w-lg py-12 text-center"><FileText aria-hidden="true" className="mx-auto size-10 text-primary" /><p className="mt-3 text-sm font-medium">This file could not be previewed.</p><p className="mt-1 text-xs text-muted-foreground">{previewError || "Try downloading it, or ask an administrator to check the Google Drive connection."}</p></div>
          : isImage ? <Image src={fileUrl} alt={file.fileName} width={2200} height={1800} unoptimized onError={() => void inspectPreviewFailure()} className="max-h-[78vh] max-w-full object-contain" />
          : isVideo ? <video src={fileUrl} controls autoPlay preload="metadata" playsInline onError={() => void inspectPreviewFailure()} className="max-h-[78vh] max-w-full bg-black" aria-label={`Video preview: ${file.fileName}`} />
            : isPdf ? <iframe src={fileUrl} title={`PDF preview: ${file.fileName}`} className="h-[78vh] w-full rounded-md bg-white" />
              : <div className="py-12 text-center"><FileText aria-hidden="true" className="mx-auto size-10 text-primary" /><p className="mt-3 text-sm font-medium">Preview is not available for this file type.</p><p className="mt-1 text-xs text-muted-foreground">Download the file to review it.</p></div>}
      </div>
    </div>
  </div>, document.body)
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
  const [showAllRecentFiles, setShowAllRecentFiles] = useState(false)
  const [previewFile, setPreviewFile] = useState<RecentClientFile | null>(null)
  const [visibleRecentFiles, setVisibleRecentFiles] = useState(recentFiles)
  const [busyFileId, setBusyFileId] = useState<string | null>(null)
  const [fileActionMessage, setFileActionMessage] = useState("")
  const [undoFile, setUndoFile] = useState<RecentClientFile | null>(null)
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

  async function setRecentFileState(file: RecentClientFile, action: "archive" | "restore") {
    if (busyFileId) return
    setBusyFileId(file.id)
    setFileActionMessage("")
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(file.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "The file could not be updated.")
      if (action === "archive") {
        setVisibleRecentFiles((current) => current.filter((item) => item.id !== file.id))
        setUndoFile(file)
        setFileActionMessage("Moved to Trash.")
      } else {
        setVisibleRecentFiles((current) => [...current, file].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
        setUndoFile(null)
        setFileActionMessage("File restored.")
      }
    } catch (error) {
      setFileActionMessage(error instanceof Error ? error.message : "The file could not be updated.")
    } finally { setBusyFileId(null) }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{initialView === "trash" ? "Client Trash" : initialTab === "campaigns" ? "Campaigns" : initialTab === "files" ? "Client files" : "Clients"}</h1>
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
                <CreateClientSubmitButton />
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
        <div className="flex items-center justify-between gap-3"><h2 id="recent-client-files" className="text-sm font-semibold">Recent files</h2><span className="text-[10px] text-muted-foreground">{visibleRecentFiles.length}</span></div>
        {fileActionMessage && <p role="status" className="mt-2 flex items-center justify-between gap-2 rounded-md border bg-background/80 px-2.5 py-1.5 text-[11px] text-muted-foreground">{fileActionMessage}{undoFile && <button type="button" onClick={() => void setRecentFileState(undoFile, "restore")} disabled={busyFileId !== null} className="font-medium text-primary hover:underline">Undo</button>}</p>}
        {visibleRecentFiles.length ? <ul className="mt-2 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{(showAllRecentFiles ? visibleRecentFiles : visibleRecentFiles.slice(0, INITIAL_RECENT_FILE_COUNT)).map((file) => <RecentFileCard key={file.id} file={file} busy={busyFileId === file.id} onOpen={() => setPreviewFile(file)} onTrash={(target) => void setRecentFileState(target, "archive")} />)}</ul> : <p className="mt-2 rounded-md border border-dashed px-3 py-4 text-center text-[11px] text-muted-foreground">No recent files yet.</p>}
        {visibleRecentFiles.length > INITIAL_RECENT_FILE_COUNT && <button type="button" aria-expanded={showAllRecentFiles} onClick={() => setShowAllRecentFiles((shown) => !shown)} className="mt-2 text-[11px] font-medium text-primary hover:underline">{showAllRecentFiles ? "Show fewer" : `View all ${visibleRecentFiles.length} files`}</button>}
      </section>}
      {previewFile && <RecentFilePreview file={previewFile} onClose={() => setPreviewFile(null)} />}

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
