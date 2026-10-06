"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Download, FileText, UploadCloud, X } from "lucide-react"

import { UploadProgress } from "@/components/states/content-state"
import { Button } from "@/components/ui/button"
import { MAX_UPLOAD_SIZE_LABEL } from "@/lib/storage/upload-limits"
import { fileCategoryLabels, getFileCategory, type FileTypeFilter } from "@/lib/storage/file-types"

type StoredFile = { id: string; file_name: string; mime_type: string; size_bytes: number; created_at: string; content_item_id?: string | null }
type UploadState = { fileName: string; progress: number; status: "uploading" | "complete" | "error"; error?: string }
const acceptedTypes = ".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.pdf,.txt,.csv,.docx,.xlsx,.pptx"

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ClientFiles({ clientId, taskId, contentItemId, canUpload = true }: { clientId: string; taskId?: string; contentItemId?: string; canUpload?: boolean }) {
  const router = useRouter()
  const headingId = useId()
  const [files, setFiles] = useState<StoredFile[]>([])
  const [storageConnected, setStorageConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState | null>(null)
  const [largeImage, setLargeImage] = useState<{ url: string; name: string } | null>(null)
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [submissionNotes, setSubmissionNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [fileFilter, setFileFilter] = useState<FileTypeFilter>("all")
  const picker = useRef<HTMLInputElement>(null)
  const activeUpload = useRef<XMLHttpRequest | null>(null)
  const visibleFiles = files.filter((file) => fileFilter === "all" || getFileCategory(file.mime_type) === fileFilter)

  const refresh = useCallback(async () => {
    try {
      const search = new URLSearchParams({ clientId })
      if (taskId) search.set("taskId", taskId)
      if (contentItemId) search.set("contentItemId", contentItemId)
      const response = await fetch(`/api/files?${search}`, { cache: "no-store" })
      const payload = await response.json() as { files?: StoredFile[]; storageConnected?: boolean; error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Files could not be loaded.")
      setFiles(payload.files ?? [])
      setStorageConnected(Boolean(payload.storageConnected))
      setMessage("")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Files could not be loaded.")
    } finally { setLoading(false) }
  }, [clientId, taskId, contentItemId])

  useEffect(() => {
    let active = true
    const search = new URLSearchParams({ clientId })
    if (taskId) search.set("taskId", taskId)
    if (contentItemId) search.set("contentItemId", contentItemId)
    fetch(`/api/files?${search}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { files?: StoredFile[]; storageConnected?: boolean; error?: string }
        if (!response.ok) throw new Error(payload.error ?? "Files could not be loaded.")
        return { files: payload.files ?? [], storageConnected: Boolean(payload.storageConnected) }
      })
      .then((result) => { if (active) { setFiles(result.files); setStorageConnected(result.storageConnected); setMessage("") } })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Files could not be loaded.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [clientId, taskId, contentItemId])

  useEffect(() => {
    if (!largeImage) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setLargeImage(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [largeImage])

  async function uploadFile(file?: File) {
    if (!file) return
    setBusy(true)
    setMessage("")
    setUploadState({ fileName: file.name, progress: 0, status: "uploading" })
    const form = new FormData()
    form.set("clientId", clientId)
    if (taskId) form.set("taskId", taskId)
    if (contentItemId) form.set("contentItemId", contentItemId)
    form.set("file", file)
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        activeUpload.current = xhr
        xhr.open("POST", "/api/files")
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setUploadState({ fileName: file.name, progress: Math.min(99, Math.round(event.loaded / event.total * 100)), status: "uploading" })
        }
        xhr.onerror = () => reject(new Error("Network error during upload."))
        xhr.onabort = () => reject(new Error("Upload canceled."))
        xhr.onload = () => {
          let payload: { error?: string } = {}
          try { payload = JSON.parse(xhr.responseText) as { error?: string } } catch { /* Use the generic fallback below. */ }
          if (xhr.status < 200 || xhr.status >= 300) reject(new Error(payload.error ?? "Upload failed."))
          else resolve()
        }
        xhr.send(form)
      })
      setUploadState({ fileName: file.name, progress: 100, status: "complete" })
      await refresh()
    } catch (error) {
      setUploadState({ fileName: file.name, progress: 0, status: "error", error: error instanceof Error ? error.message : "Upload failed. Check the Drive connection and try again." })
    } finally {
      activeUpload.current = null
      setBusy(false)
      if (picker.current) picker.current.value = ""
    }
  }

  async function submitForReview() {
    if (!contentItemId || !selectedFileIds.length || submitting) return
    setSubmitting(true)
    setMessage("")
    try {
      const response = await fetch(`/api/content/${encodeURIComponent(contentItemId)}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attachmentIds: selectedFileIds, notes: submissionNotes }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not submit this content for review.")
      setSelectedFileIds([])
      setSubmissionNotes("")
      setMessage("Submitted for supervisor review.")
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit this content for review.")
    } finally { setSubmitting(false) }
  }

  return <section aria-labelledby={headingId} className={taskId ? "mt-4 border-t border-border/70 pt-4" : "mt-6 border-t border-border/70 pt-5"}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id={headingId} className="text-sm font-semibold">{contentItemId ? "Content files" : taskId ? "Task files" : "Client files"}</h2><p className="mt-1 text-xs text-muted-foreground">Private files stored in Google Drive. Maximum file size: {MAX_UPLOAD_SIZE_LABEL}.</p></div>
      {canUpload && <div>
        <input ref={picker} className="sr-only" type="file" accept={acceptedTypes} onChange={(event) => void uploadFile(event.target.files?.[0])} />
        <Button type="button" size="sm" disabled={busy || loading || !storageConnected} onClick={() => picker.current?.click()}><UploadCloud aria-hidden="true" className="mr-1.5 size-3.5" />{busy ? "Uploading…" : "Upload file"}</Button>
      </div>}
    </div>
    {message && <p role="status" className="mt-3 rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">{message}</p>}
    {uploadState && <div className="mt-3"><UploadProgress fileName={uploadState.fileName} progress={uploadState.progress} status={uploadState.status} errorMessage={uploadState.error} onCancel={uploadState.status === "uploading" && uploadState.progress < 99 ? () => activeUpload.current?.abort() : undefined} onRetry={uploadState.status === "error" ? () => { setUploadState(null); picker.current?.click() } : undefined} /></div>}
    {!loading && !storageConnected && <p className="mt-3 text-xs text-muted-foreground">Google Drive isn’t ready yet. Ask an Administrator to connect it under File storage settings.</p>}
    {!loading && files.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><label className="text-[11px] font-medium text-muted-foreground" htmlFor={`${headingId}-file-filter`}>Filter files</label><select id={`${headingId}-file-filter`} value={fileFilter} onChange={(event) => setFileFilter(event.target.value as FileTypeFilter)} className="h-8 rounded-md border bg-background px-2 text-xs"><option value="all">All types ({files.length})</option>{Object.entries(fileCategoryLabels).map(([category, label]) => <option key={category} value={category}>{label} ({files.filter((file) => getFileCategory(file.mime_type) === category).length})</option>)}</select></div>}
    {loading ? <p className="mt-4 rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">Loading files…</p> : visibleFiles.length ? <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleFiles.map((file) => {
      const previewUrl = `/api/files/${encodeURIComponent(file.id)}?inline=1`
      const isImage = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mime_type)
      const isVideo = ["video/mp4", "video/webm", "video/quicktime"].includes(file.mime_type)
      return <li key={file.id} className="min-w-0 rounded-xl border border-border/80 bg-card/85 p-2.5 shadow-sm transition hover:border-primary/25 hover:shadow-md">
        <div className="mb-2.5 h-28 overflow-hidden rounded-lg border bg-muted/35">
          {isImage ? <button type="button" onClick={() => setLargeImage({ url: previewUrl, name: file.file_name })} aria-label={`View larger image: ${file.file_name}`} className="block size-full cursor-zoom-in"><Image src={previewUrl} alt={`Preview of ${file.file_name}`} width={640} height={480} unoptimized className="size-full object-contain" /></button> : isVideo ? <video src={previewUrl} controls preload="metadata" playsInline className="size-full bg-black object-contain" aria-label={`Video preview: ${file.file_name}`}>Your browser cannot play this video format. Download the file to view it.</video> : <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground"><FileText aria-hidden="true" className="size-8 text-primary/75" /><span className="text-[10px]">Preview unavailable</span></div>}
        </div>
        <span className="flex min-w-0 items-start gap-3">{contentItemId && <input type="checkbox" aria-label={`Include ${file.file_name} in review`} checked={selectedFileIds.includes(file.id)} onChange={(event) => setSelectedFileIds((current) => event.target.checked ? [...current, file.id] : current.filter((id) => id !== file.id))} className="mt-1 size-4 accent-primary" />}<FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{file.file_name}</span><span className="text-[10px] text-muted-foreground">{file.mime_type} · {formatSize(file.size_bytes)} · {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(file.created_at))}</span></span></span>
        <a href={`/api/files/${encodeURIComponent(file.id)}`} className="mt-2.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border bg-background/65 px-2 text-xs font-medium hover:bg-muted/50"><Download aria-hidden="true" className="size-3.5" />Download</a>
      </li>
    })}</ul> : !message && <p className="mt-4 rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">{files.length ? "No files match this type filter." : `No files have been uploaded for this ${contentItemId ? "content item" : taskId ? "task" : "client"} yet.`}</p>}
    {contentItemId && files.length > 0 && <div className="mt-4 rounded-lg border border-primary/15 bg-background/60 p-3">
      <p className="text-xs font-semibold">Submit selected files for supervisor review</p>
      <p className="mt-1 text-[11px] text-muted-foreground">This creates a numbered, read-only version. Choose all files the reviewer should see together.</p>
      <label className="mt-3 grid gap-1.5 text-[11px] font-medium">Submission notes<textarea value={submissionNotes} onChange={(event) => setSubmissionNotes(event.target.value)} maxLength={5000} placeholder="What should the supervisor check?" className="min-h-16 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></label>
      <Button type="button" size="sm" disabled={!canUpload || !selectedFileIds.length || submitting} onClick={() => void submitForReview()} className="mt-3">{submitting ? "Submitting…" : `Submit ${selectedFileIds.length || "selected"} file${selectedFileIds.length === 1 ? "" : "s"} for review`}</Button>
    </div>}
    {largeImage && createPortal(<div role="dialog" aria-modal="true" aria-label={`Image preview: ${largeImage.name}`} onClick={() => setLargeImage(null)} className="fixed inset-0 z-[1000] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 sm:p-8">
      <button type="button" onClick={() => setLargeImage(null)} aria-label="Close image preview" className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"><X className="size-5" /></button>
      <div className="flex max-h-full max-w-full cursor-default flex-col items-center" onClick={(event) => event.stopPropagation()}>
        <Image src={largeImage.url} alt={largeImage.name} width={2000} height={1600} unoptimized className="max-h-[85vh] max-w-[92vw] object-contain" />
        <p className="mt-3 max-w-[92vw] truncate text-xs text-white/85">{largeImage.name}</p>
      </div>
    </div>, document.body)}
  </section>
}
