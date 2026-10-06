"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Archive, Download, FileText, Film, Image as ImageIcon, LoaderCircle, Play, RotateCcw, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { fileCategoryLabels, getFileCategory, type FileCategory } from "@/lib/storage/file-types"

type ManagedFile = {
  id: string
  file_name: string
  mime_type: string
  size_bytes: number
  created_at: string
  deleted_at: string | null
  client_name: string
  campaign_name: string | null
  task_title: string | null
  content_title: string | null
  uploader_name: string
  in_submission_history: boolean
}
type ViewFilter = "all" | FileCategory
type PreviewFile = Pick<ManagedFile, "id" | "file_name" | "mime_type">

const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
const fileDate = new Intl.DateTimeFormat("en", { dateStyle: "medium" })

export function AdminFileManager() {
  const [view, setView] = useState<"active" | "trash">("active")
  const [files, setFiles] = useState<ManagedFile[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<ViewFilter>("all")
  const [message, setMessage] = useState("")
  const [preview, setPreview] = useState<PreviewFile | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/files?status=${view}`, { cache: "no-store" })
      const payload = await response.json() as { files?: ManagedFile[]; limited?: boolean; contentReviewReady?: boolean; error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not load files.")
      setFiles(payload.files ?? [])
      setMessage([
        payload.contentReviewReady === false ? "Content review storage is not fully migrated. Content-linked files or their review-history protections may be unavailable; apply supabase/migrations/202610120001_content_item_review_workflow.sql in Supabase." : "",
        payload.limited ? "Showing the newest 500 files. Refine your view to work through the current list." : "",
      ].filter(Boolean).join(" "))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load files.")
    } finally { setLoading(false) }
  }, [view])

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timeout)
  }, [refresh])

  useEffect(() => {
    if (!preview) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPreview(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [preview])

  const counts = useMemo(() => ({
    all: files.length,
    image: files.filter((file) => getFileCategory(file.mime_type) === "image").length,
    video: files.filter((file) => getFileCategory(file.mime_type) === "video").length,
    document: files.filter((file) => getFileCategory(file.mime_type) === "document").length,
    other: files.filter((file) => getFileCategory(file.mime_type) === "other").length,
  }), [files])

  const visibleFiles = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return files.filter((file) => {
      const matchesType = typeFilter === "all" || getFileCategory(file.mime_type) === typeFilter
      const haystack = [file.file_name, file.client_name, file.campaign_name, file.task_title, file.content_title, file.uploader_name].filter(Boolean).join(" ").toLocaleLowerCase()
      return matchesType && (!term || haystack.includes(term))
    })
  }, [files, query, typeFilter])

  async function changeFileState(file: ManagedFile) {
    if (busyId) return
    const action = view === "trash" ? "restore" : "archive"
    setBusyId(file.id)
    setMessage("")
    try {
      const response = await fetch(`/api/admin/files/${encodeURIComponent(file.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? `Could not ${action} this file.`)
      setFiles((current) => current.filter((item) => item.id !== file.id))
      setMessage(action === "archive" ? "File moved to the archive. The Drive copy is retained." : "File restored.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not ${action} this file.`)
    } finally { setBusyId(null) }
  }

  return <section className="mt-5 rounded-xl border bg-card/75 p-3 sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="text-sm font-semibold">Organization files</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Browse client, task, and content files. Archive retains the private Drive copy; submitted review history is protected.</p></div>
      <div className="flex shrink-0 rounded-lg border bg-background p-1" role="group" aria-label="File archive view">
        {(["active", "trash"] as const).map((item) => <button key={item} type="button" onClick={() => setView(item)} aria-pressed={view === item} className={`rounded-md px-3 py-1.5 text-xs font-medium ${view === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{item === "active" ? "Active files" : "Archive"}</button>)}
      </div>
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label className="relative"><span className="sr-only">Search organization files</span><Search aria-hidden="true" className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search file, client, campaign, or uploader…" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-xs outline-none focus:border-primary" /></label>
      <label className="flex items-center gap-2 text-[11px] text-muted-foreground"><span>Type</span><select aria-label="Filter files by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as ViewFilter)} className="h-9 rounded-md border bg-background px-2 text-xs text-foreground"><option value="all">All types ({counts.all})</option>{Object.entries(fileCategoryLabels).map(([type, label]) => <option key={type} value={type}>{label} ({counts[type as FileCategory]})</option>)}</select></label>
    </div>

    {message && <p role="status" className="mt-3 rounded-md border bg-background px-3 py-2 text-[11px] leading-4 text-muted-foreground">{message}</p>}
    {loading ? <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading organization files…</div> : visibleFiles.length ? <>
      <p className="mt-3 text-[10px] text-muted-foreground">{visibleFiles.length} {visibleFiles.length === 1 ? "file" : "files"}</p>
      <ul className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{visibleFiles.map((file) => {
        const image = file.mime_type.startsWith("image/")
        const video = file.mime_type.startsWith("video/")
        const pdf = file.mime_type === "application/pdf"
        const location = file.content_title ? `Content · ${file.content_title}` : file.task_title ? `Task · ${file.task_title}` : file.campaign_name ? `Campaign · ${file.campaign_name}` : "Client files"
        const inlineUrl = `/api/files/${encodeURIComponent(file.id)}?inline=1`
        return <li key={file.id} className="group min-w-0 overflow-hidden rounded-lg border bg-background/75 transition hover:border-primary/35 hover:shadow-sm">
          <div className="relative aspect-[4/3] overflow-hidden border-b bg-muted/35">
            {image ? <button type="button" onClick={() => setPreview(file)} aria-label={`Open image preview: ${file.file_name}`} className="absolute inset-0 block h-full w-full"><Image src={inlineUrl} alt={`Preview: ${file.file_name}`} width={480} height={360} unoptimized className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]" /></button>
              : video ? <button type="button" onClick={() => setPreview(file)} aria-label={`Play video: ${file.file_name}`} className="absolute inset-0 grid h-full w-full place-items-center bg-gradient-to-br from-secondary/45 to-muted text-primary"><span className="grid size-11 place-items-center rounded-full border bg-background/85 shadow"><Play className="ml-0.5 size-5 fill-current" /></span><span className="absolute bottom-2 left-2 rounded bg-background/85 px-1.5 py-0.5 text-[9px] font-semibold uppercase">Video</span></button>
              : <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">{pdf ? <FileText className="size-9 text-primary/70" /> : <FileText className="size-9" />}<span className="rounded bg-background/85 px-1.5 py-0.5 text-[9px] font-semibold uppercase">{file.file_name.split(".").at(-1)?.slice(0, 8) || "File"}</span></div>}
            {file.in_submission_history && <span title="Attached to submitted review history" className="absolute left-2 top-2 rounded-full border bg-background/90 px-2 py-1 text-[9px] font-medium text-amber-800 dark:text-amber-300">Protected</span>}
          </div>

          <div className="p-2.5">
            <p className="truncate text-[11px] font-semibold" title={file.file_name}>{file.file_name}</p>
            <p className="mt-1 truncate text-[10px] text-muted-foreground" title={`${file.client_name} · ${location}`}>{file.client_name} · {location}</p>
            <p className="mt-1 truncate text-[9px] text-muted-foreground" title={`Uploaded by ${file.uploader_name}`}>{formatSize(file.size_bytes)} · {fileDate.format(new Date(file.created_at))}</p>
            <div className="mt-2 flex items-center justify-between gap-1 border-t pt-2">
              <div className="flex min-w-0 items-center gap-1">
                {(image || video) && <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Preview ${file.file_name}`} title="Preview" onClick={() => setPreview(file)}>{image ? <ImageIcon className="size-3.5" /> : <Film className="size-3.5" />}</Button>}
                {pdf && <a href={inlineUrl} target="_blank" rel="noreferrer" className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Preview ${file.file_name}`} title="Preview"><FileText className="size-3.5" /></a>}
                <a href={`/api/files/${encodeURIComponent(file.id)}`} className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Download ${file.file_name}`} title="Download"><Download className="size-3.5" /></a>
              </div>
              {file.in_submission_history ? <span className="text-[9px] text-muted-foreground">History kept</span> : <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" disabled={busyId !== null} onClick={() => void changeFileState(file)} aria-label={`${view === "trash" ? "Restore" : "Archive"} ${file.file_name}`} title={view === "trash" ? "Restore" : "Archive"}>{busyId === file.id ? <LoaderCircle className="size-3.5 animate-spin" /> : view === "trash" ? <RotateCcw className="size-3.5" /> : <Archive className="size-3.5" />}</Button>}
            </div>
          </div>
        </li>
      })}</ul>
    </> : <p className="mt-3 rounded-md border border-dashed p-8 text-center text-xs text-muted-foreground">{files.length ? "No files match those filters." : view === "trash" ? "The archive is empty." : "No organization files have been uploaded yet."}</p>}

    {preview && <div role="dialog" aria-modal="true" aria-label={`Preview ${preview.file_name}`} onClick={() => setPreview(null)} className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 sm:p-8">
      <button type="button" onClick={() => setPreview(null)} aria-label="Close preview" className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"><X className="size-5" /></button>
      <div className="flex max-h-full max-w-full cursor-default flex-col items-center" onClick={(event) => event.stopPropagation()}>
        {preview.mime_type.startsWith("video/") ? <video src={`/api/files/${encodeURIComponent(preview.id)}?inline=1`} controls autoPlay playsInline className="max-h-[82vh] max-w-[92vw] bg-black" /> : <Image src={`/api/files/${encodeURIComponent(preview.id)}?inline=1`} alt={preview.file_name} width={2000} height={1600} unoptimized className="max-h-[82vh] max-w-[92vw] object-contain" />}
        <p className="mt-3 max-w-[92vw] truncate text-xs text-white/85">{preview.file_name}</p>
      </div>
    </div>}
  </section>
}
