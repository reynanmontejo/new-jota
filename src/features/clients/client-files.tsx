"use client"

import { useCallback, useEffect, useId, useRef, useState, type ClipboardEvent } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ClipboardPaste, Download, FileText, UploadCloud, X } from "lucide-react"

import { UploadProgress } from "@/components/states/content-state"
import { Button } from "@/components/ui/button"
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_LABEL } from "@/lib/storage/upload-limits"
import { fileCategoryLabels, getFileCategory, type FileTypeFilter } from "@/lib/storage/file-types"
import { getPreviewMimeType } from "@/lib/storage/preview-types"

type StoredFile = { id: string; file_name: string; mime_type: string; size_bytes: number; created_at: string; content_item_id?: string | null }
type UploadState = { fileName: string; progress: number; status: "uploading" | "complete" | "error"; error?: string }
const acceptedTypes = ".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.pdf,.txt,.csv,.docx,.xlsx,.pptx"

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ClientFiles({ clientId, taskId, contentItemId, canUpload = true, canSubmitForReview = true, compact = false }: { clientId: string; taskId?: string; contentItemId?: string; canUpload?: boolean; canSubmitForReview?: boolean; compact?: boolean }) {
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
  const uploadAbort = useRef<AbortController | null>(null)
  const initialSelectionApplied = useRef(false)
  const visibleFiles = files.filter((file) => fileFilter === "all" || getFileCategory(file.mime_type) === fileFilter)

  const refresh = useCallback(async () => {
    try {
      const search = new URLSearchParams()
      if (clientId) search.set("clientId", clientId)
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
    initialSelectionApplied.current = false
    let active = true
    const search = new URLSearchParams()
    if (clientId) search.set("clientId", clientId)
    if (taskId) search.set("taskId", taskId)
    if (contentItemId) search.set("contentItemId", contentItemId)
    fetch(`/api/files?${search}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { files?: StoredFile[]; storageConnected?: boolean; error?: string }
        if (!response.ok) throw new Error(payload.error ?? "Files could not be loaded.")
        return { files: payload.files ?? [], storageConnected: Boolean(payload.storageConnected) }
      })
      .then((result) => { if (active) { setFiles(result.files); setStorageConnected(result.storageConnected); setMessage(""); if (taskId && canUpload && !initialSelectionApplied.current) { setSelectedFileIds(result.files[0] ? [result.files[0].id] : []); initialSelectionApplied.current = true } } })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Files could not be loaded.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [clientId, taskId, contentItemId, canUpload])

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
    const chosenFile = file
    if (file.size < 1 || file.size > MAX_UPLOAD_SIZE_BYTES) {
      setMessage(`File must be between 1 byte and ${MAX_UPLOAD_SIZE_LABEL}.`)
      if (picker.current) picker.current.value = ""
      return
    }
    setBusy(true)
    setMessage("")
    setUploadState({ fileName: file.name, progress: 0, status: "uploading" })
    const controller = new AbortController()
    uploadAbort.current = controller
    try {
      const start = await fetch("/api/files/resumable", {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ clientId, taskId, contentItemId, fileName: file.name, mimeType: file.type, size: file.size }),
      })
      const started = await start.json() as { session?: string; chunkBytes?: number; error?: string }
      if (!start.ok || !started.session || !started.chunkBytes) throw new Error(started.error ?? "Upload could not start.")
      const session = started.session
      const chunkBytes = started.chunkBytes
      async function checkProgress() {
        const response = await fetch("/api/files/resumable", { headers: { "x-upload-session": session }, signal: controller.signal, cache: "no-store" })
        const payload = await response.json() as { nextOffset?: number; file?: { id?: string }; error?: string }
        if (!response.ok) throw new Error(payload.error ?? "Could not check upload progress.")
        return payload
      }
      function sendChunk(offset: number) {
        return new Promise<{ nextOffset?: number; file?: { id?: string } }>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          activeUpload.current = xhr
          xhr.open("PUT", "/api/files/resumable")
          xhr.setRequestHeader("x-upload-session", session)
          xhr.setRequestHeader("x-upload-offset", String(offset))
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) setUploadState({ fileName: chosenFile.name, progress: Math.min(99, Math.round((offset + event.loaded) / chosenFile.size * 100)), status: "uploading" })
          }
          xhr.onerror = () => reject(new Error("Network error during upload."))
          xhr.onabort = () => reject(new Error("Upload canceled."))
          xhr.onload = () => {
            let payload: { nextOffset?: number; file?: { id?: string }; error?: string } = {}
            try { payload = JSON.parse(xhr.responseText) as typeof payload } catch { /* Use the generic fallback below. */ }
            if (xhr.status < 200 || xhr.status >= 300) reject(new Error(payload.error ?? "Upload failed."))
            else resolve(payload)
          }
          xhr.send(chosenFile.slice(offset, Math.min(offset + chunkBytes, chosenFile.size), chosenFile.type))
        })
      }
      let offset = 0
      let uploadedFileId = ""
      let interruptions = 0
      while (offset < file.size && !uploadedFileId) {
        if (controller.signal.aborted) throw new Error("Upload canceled.")
        try {
          const result = await sendChunk(offset)
          if (result.file?.id) uploadedFileId = result.file.id
          else if (Number.isSafeInteger(result.nextOffset) && result.nextOffset! > offset && result.nextOffset! <= file.size) offset = result.nextOffset!
          else throw new Error("Google Drive did not confirm the upload position.")
          interruptions = 0
        } catch (error) {
          if (controller.signal.aborted) throw new Error("Upload canceled.")
          if (++interruptions > 3) throw error
          const progress = await checkProgress()
          if (progress.file?.id) uploadedFileId = progress.file.id
          else if (Number.isSafeInteger(progress.nextOffset) && progress.nextOffset! >= 0 && progress.nextOffset! < file.size) offset = progress.nextOffset!
          else throw error
        }
      }
      if (!uploadedFileId) throw new Error("Google Drive did not confirm the uploaded file.")
      if (uploadedFileId && (taskId || contentItemId)) setSelectedFileIds((current) => [...new Set([...current, uploadedFileId])])
      setUploadState({ fileName: file.name, progress: 100, status: "complete" })
      await refresh()
    } catch (error) {
      setUploadState({ fileName: file.name, progress: 0, status: "error", error: controller.signal.aborted ? "Upload canceled." : error instanceof Error ? error.message : "Upload failed. Check the Drive connection and try again." })
    } finally {
      activeUpload.current = null
      uploadAbort.current = null
      setBusy(false)
      if (picker.current) picker.current.value = ""
    }
  }

  function pasteImage(event: ClipboardEvent<HTMLButtonElement>) {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.kind === "file" && item.type.startsWith("image/"))
    if (!imageItem) return
    event.preventDefault()
    if (busy) {
      setMessage("Wait for the current upload to finish before pasting another image.")
      return
    }
    const clipboardFile = imageItem.getAsFile()
    if (!clipboardFile) {
      setMessage("The clipboard image could not be read. Copy the image again and retry.")
      return
    }
    const imageExtensions: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
    }
    const extension = imageExtensions[clipboardFile.type]
    if (!extension) {
      setMessage("Pasted images must be PNG, JPG, WEBP, or GIF.")
      return
    }
    const pastedFile = new File([clipboardFile], `pasted-image-${Date.now()}.${extension}`, { type: clipboardFile.type })
    void uploadFile(pastedFile)
  }

  async function submitForReview() {
    if ((!contentItemId && !taskId) || !selectedFileIds.length || submitting) return
    setSubmitting(true)
    setMessage("")
    try {
      const endpoint = contentItemId
        ? `/api/content/${encodeURIComponent(contentItemId)}/submit`
        : `/api/tasks/${encodeURIComponent(taskId!)}/submit`
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attachmentIds: selectedFileIds, notes: submissionNotes }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not submit these files for review.")
      setSelectedFileIds([])
      setSubmissionNotes("")
      setMessage(contentItemId ? "Submitted for supervisor review." : "Task work submitted for supervisor review.")
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit this content for review.")
    } finally { setSubmitting(false) }
  }

  return <section aria-labelledby={headingId} className={compact ? "mt-3 border-t border-border/70 pt-3" : taskId ? "mt-4 border-t border-border/70 pt-4" : "mt-6 border-t border-border/70 pt-5"}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id={headingId} className="text-sm font-semibold">{contentItemId ? "Content files" : taskId ? "Task files" : "Client files"}</h2><p className="mt-1 text-xs text-muted-foreground">{compact ? `Google Drive · up to ${MAX_UPLOAD_SIZE_LABEL} per file` : `Private files stored in Google Drive. Maximum file size: ${MAX_UPLOAD_SIZE_LABEL}.`}</p></div>
      {canUpload && <div>
        <input ref={picker} className="sr-only" type="file" accept={acceptedTypes} onChange={(event) => void uploadFile(event.target.files?.[0])} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={busy || loading || !storageConnected} onClick={() => picker.current?.click()}><UploadCloud aria-hidden="true" className="mr-1.5 size-3.5" />{busy ? "Uploading…" : "Upload file"}</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy || loading || !storageConnected} onPaste={pasteImage} title="Click this button, then press Ctrl+V to upload a copied image"><ClipboardPaste aria-hidden="true" className="mr-1.5 size-3.5" />Paste image</Button>
        </div>
        <p className="mt-1.5 text-right text-[10px] text-muted-foreground">Click “Paste image”, then press Ctrl+V.</p>
      </div>}
    </div>
    {message && <p role="status" className="mt-3 rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">{message}</p>}
    {uploadState && <div className="mt-3"><UploadProgress fileName={uploadState.fileName} progress={uploadState.progress} status={uploadState.status} errorMessage={uploadState.error} onCancel={uploadState.status === "uploading" ? () => { uploadAbort.current?.abort(); activeUpload.current?.abort() } : undefined} onRetry={uploadState.status === "error" ? () => { setUploadState(null); picker.current?.click() } : undefined} /></div>}
    {!loading && !storageConnected && <p className="mt-3 text-xs text-muted-foreground">Google Drive isn’t ready yet. Ask an Administrator to connect it under File storage settings.</p>}
    {!compact && !loading && files.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><label className="text-[11px] font-medium text-muted-foreground" htmlFor={`${headingId}-file-filter`}>Filter files</label><select id={`${headingId}-file-filter`} value={fileFilter} onChange={(event) => setFileFilter(event.target.value as FileTypeFilter)} className="h-8 rounded-md border bg-background px-2 text-xs"><option value="all">All types ({files.length})</option>{Object.entries(fileCategoryLabels).map(([category, label]) => <option key={category} value={category}>{label} ({files.filter((file) => getFileCategory(file.mime_type) === category).length})</option>)}</select></div>}
    {loading ? <p className="mt-3 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Loading files…</p> : visibleFiles.length ? <ul className={compact ? "mt-3 grid grid-cols-1 gap-2" : "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"}>{visibleFiles.map((file) => {
      const previewUrl = `/api/files/${encodeURIComponent(file.id)}?inline=1`
      const previewMimeType = getPreviewMimeType(file.mime_type, file.file_name)
      const isImage = previewMimeType?.startsWith("image/") ?? false
      const isVideo = previewMimeType?.startsWith("video/") ?? false
      return <li key={file.id} className={`min-w-0 rounded-xl border border-border/80 bg-card/85 ${compact ? "p-2" : "p-2.5"} shadow-sm transition hover:border-primary/25 hover:shadow-md`}>
        {compact ? <div className="flex min-w-0 items-center gap-3">
          <div className="h-[68px] w-28 shrink-0 overflow-hidden rounded-lg border bg-muted/35">
            {isImage ? <button type="button" onClick={() => setLargeImage({ url: previewUrl, name: file.file_name })} aria-label={`View larger image: ${file.file_name}`} className="block size-full cursor-zoom-in"><Image src={previewUrl} alt={`Preview of ${file.file_name}`} width={320} height={200} unoptimized className="size-full object-contain" /></button> : isVideo ? <video src={previewUrl} controls preload="metadata" playsInline className="size-full bg-black object-contain" aria-label={`Video preview: ${file.file_name}`}>Your browser cannot play this video format. Download the file to view it.</video> : <div className="flex size-full items-center justify-center"><FileText aria-hidden="true" className="size-6 text-primary/75" /></div>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">{(contentItemId || (taskId && canSubmitForReview)) && canUpload && <input type="checkbox" aria-label={`Include ${file.file_name} in review`} checked={selectedFileIds.includes(file.id)} onChange={(event) => setSelectedFileIds((current) => event.target.checked ? [...current, file.id] : current.filter((id) => id !== file.id))} className="size-4 shrink-0 accent-primary" />}<FileText aria-hidden="true" className="size-4 shrink-0 text-primary" /><span className="truncate text-xs font-medium">{file.file_name}</span></div>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">{file.mime_type} · {formatSize(file.size_bytes)}</p>
            <a href={`/api/files/${encodeURIComponent(file.id)}`} className="mt-1.5 inline-flex h-7 items-center gap-1.5 rounded-md border bg-background/65 px-2 text-[11px] font-medium hover:bg-muted/50"><Download aria-hidden="true" className="size-3" />Download</a>
          </div>
        </div> : <>
          <div className="mb-2 overflow-hidden rounded-lg border bg-muted/35 h-28">
            {isImage ? <button type="button" onClick={() => setLargeImage({ url: previewUrl, name: file.file_name })} aria-label={`View larger image: ${file.file_name}`} className="block size-full cursor-zoom-in"><Image src={previewUrl} alt={`Preview of ${file.file_name}`} width={640} height={480} unoptimized className="size-full object-contain" /></button> : isVideo ? <video src={previewUrl} controls preload="metadata" playsInline className="size-full bg-black object-contain" aria-label={`Video preview: ${file.file_name}`}>Your browser cannot play this video format. Download the file to view it.</video> : <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground"><FileText aria-hidden="true" className="size-8 text-primary/75" /><span className="text-[10px]">Preview unavailable</span></div>}
          </div>
          <span className="flex min-w-0 items-start gap-3">{(contentItemId || (taskId && canSubmitForReview)) && canUpload && <input type="checkbox" aria-label={`Include ${file.file_name} in review`} checked={selectedFileIds.includes(file.id)} onChange={(event) => setSelectedFileIds((current) => event.target.checked ? [...current, file.id] : current.filter((id) => id !== file.id))} className="mt-1 size-4 accent-primary" />}<FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{file.file_name}</span><span className="text-[10px] text-muted-foreground">{file.mime_type} · {formatSize(file.size_bytes)} · {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(file.created_at))}</span></span></span>
          <a href={`/api/files/${encodeURIComponent(file.id)}`} className="mt-2.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border bg-background/65 px-2 text-xs font-medium hover:bg-muted/50"><Download aria-hidden="true" className="size-3.5" />Download</a>
        </>}
      </li>
    })}</ul> : !message && <p className="mt-4 rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">{files.length ? "No files match this type filter." : `No files have been uploaded for this ${contentItemId ? "content item" : taskId ? "task" : "client"} yet.`}</p>}
    {(contentItemId || (taskId && canSubmitForReview)) && canUpload && files.length > 0 && <div className="mt-4 rounded-lg border border-primary/15 bg-background/60 p-3">
      <p className="text-xs font-semibold">Submit for review</p>
      <label className="mt-3 grid gap-1.5 text-[11px] font-medium">Add notes (optional)<textarea value={submissionNotes} onChange={(event) => setSubmissionNotes(event.target.value)} maxLength={5000} placeholder="Add a note for the reviewer (optional)" className="min-h-16 w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></label>
      <Button type="button" size="sm" disabled={!canUpload || !selectedFileIds.length || submitting} onClick={() => void submitForReview()} className="mt-3">{submitting ? "Submitting…" : selectedFileIds.length ? `Submit ${selectedFileIds.length} file${selectedFileIds.length === 1 ? "" : "s"} for review` : "Select a file to submit"}</Button>
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
