"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import {
  CheckCircle2,
  Clock3,
  Download,
  FileVideo2,
  LockKeyhole,
  MessageSquareText,
  RotateCcw,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react"

import { ContentState } from "@/components/states/content-state"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useWorkflow } from "@/features/workflow/workflow-provider"
import { cn } from "@/lib/utils"

const reviewer = { id: "sarah", name: "Sarah Chen", initials: "SC" }

export function ReviewWorkspace() {
  const { tasks, currentUser, demoMode, reviewLatestVersion, realtimeRevision } = useWorkflow()
  const queue = useMemo(() => tasks.filter((task) => task.versions.at(-1)?.status === "submitted"), [tasks])
  const [selectedId, setSelectedId] = useState<string | null>(queue[0]?.id ?? null)
  const [comment, setComment] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const selectedTask = queue.find((task) => task.id === selectedId) ?? queue[0]
  const latestVersion = selectedTask?.versions.at(-1)
  const selfApproval = latestVersion?.submittedById === reviewer.id

  if (!demoMode) return <PersistentReviewWorkspace realtimeRevision={realtimeRevision} />

  if (currentUser.role !== "supervisor") {
    return <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8"><ContentState variant="access_denied" title="Supervisor access required" description="Switch to the supervisor demo account to review submissions." /></main>
  }

  function decide(decision: "approved" | "revision_requested") {
    if (!selectedTask || selfApproval) return
    if (decision === "revision_requested" && !comment.trim()) {
      setMessage("Add revision feedback before returning this submission.")
      return
    }
    reviewLatestVersion(selectedTask.id, decision, comment.trim() || "Approved for delivery.")
    setMessage(decision === "approved" ? "Submission approved." : "Revision requested and returned to the owner.")
    setComment("")
  }

  function downloadMockFile() {
    if (!latestVersion?.files[0]) return
    const blob = new Blob([`Mock preview for ${latestVersion.files[0].name}`], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${latestVersion.files[0].name}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Supervisor workspace</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">Review queue</h1><p className="mt-1 text-sm text-muted-foreground">Inspect submitted work and record a clear decision.</p>{!demoMode && <p className="mt-2 text-xs text-muted-foreground">Persistent file submissions and review decisions are not connected yet.</p>}</div>
        <div className="glass-panel flex items-center gap-3 rounded-xl border px-3 py-2"><Avatar className="size-8"><AvatarFallback className="bg-secondary/40 text-xs">SC</AvatarFallback></Avatar><span><span className="block text-xs font-semibold">Sarah Chen</span><span className="block text-[10px] text-muted-foreground">Supervisor reviewer</span></span></div>
      </div>

      <div className="mt-5 grid min-h-[640px] gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="glass-panel rounded-2xl border p-3">
          <div className="flex items-center justify-between px-2 py-2"><div><h2 className="text-sm font-semibold">Awaiting review</h2><p className="text-[11px] text-muted-foreground">Oldest submissions first</p></div><Badge className="bg-primary text-primary-foreground">{queue.length}</Badge></div>
          <div className="mt-2 space-y-2">{queue.length === 0 ? <ContentState variant="empty" title="Queue cleared" description="There are no submissions waiting for review." compact /> : queue.map((task) => {
            const version = task.versions.at(-1)
            return <button key={task.id} onClick={() => { setSelectedId(task.id); setMessage(null) }} className={cn("w-full rounded-xl border p-3 text-left transition", selectedTask?.id === task.id ? "border-primary/40 bg-secondary/28 shadow-sm" : "border-transparent bg-background/48 hover:border-primary/15")}><div className="flex items-start gap-3"><Avatar className="size-8"><AvatarFallback className="bg-primary/12 text-[10px]">{task.primaryOwner.initials}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{task.title}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{task.clientName} · V{version?.number}</span></span><Clock3 className="size-3.5 text-primary" /></div></button>
          })}</div>
        </aside>

        {!selectedTask || !latestVersion ? <ContentState variant="empty" title="Select a submission" description="Choose a queued item to inspect its files and history." /> : (
          <section className="space-y-5">
            <div className="glass-panel rounded-2xl border p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Version {latestVersion.number}</Badge><Badge className="bg-accent/18 text-[#765126] dark:text-accent">Awaiting review</Badge></div><h2 className="mt-3 text-xl font-semibold">{selectedTask.title}</h2><p className="mt-1 text-sm text-muted-foreground">{selectedTask.clientName} · {selectedTask.campaign}</p></div><div className="text-left text-xs text-muted-foreground sm:text-right"><p className="font-semibold text-foreground">Submitted by {latestVersion.submittedBy}</p><p className="mt-1">{latestVersion.submittedAt}</p></div></div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="relative flex min-h-[330px] items-center justify-center overflow-hidden rounded-2xl border border-primary/16 bg-gradient-to-br from-[#201d19] to-[#3a2e23] text-[#fdfcfb] shadow-inner">
                  <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_30%_20%,#e0aa66,transparent_30%),radial-gradient(circle_at_80%_70%,#af8653,transparent_35%)]" />
                  <div className="relative text-center"><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-white/10 backdrop-blur"><FileVideo2 className="size-7 text-accent" /></span><p className="mt-4 text-sm font-semibold">{latestVersion.files[0]?.name}</p><p className="mt-1 text-xs text-white/55">Mock file preview</p><Button onClick={downloadMockFile} variant="outline" size="sm" className="mt-4 border-white/20 bg-white/10 text-white hover:bg-white/20"><Download data-icon="inline-start" /> Download review copy</Button></div>
                </div>

                <div className="space-y-3">
                  <Info icon={UserRoundCheck} label="Primary owner" value={selectedTask.primaryOwner.name} />
                  <Info icon={ShieldCheck} label="Reviewer" value={reviewer.name} />
                  <Info icon={LockKeyhole} label="Version policy" value="Immutable after submission" />
                  <div className="rounded-xl border border-primary/14 bg-background/55 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Submission notes</p><p className="mt-2 text-xs leading-5">{latestVersion.notes}</p></div>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-2xl border p-5">
              <div className="flex items-center gap-2"><MessageSquareText className="size-4 text-primary" /><h2 className="font-semibold">Review decision</h2></div>
              {selfApproval && <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive">Self-approval is blocked. Assign another supervisor to review this version.</div>}
              <label className="mt-4 block text-xs font-semibold">Review comments<textarea value={comment} onChange={(event) => { setComment(event.target.value); setMessage(null) }} placeholder="Explain the decision or list exact revision requests..." className="mt-2 min-h-24 w-full resize-none rounded-xl border border-primary/20 bg-background/70 p-3 text-sm font-normal outline-none focus:border-primary focus:ring-3 focus:ring-primary/10" /></label>
              {message && <p className="mt-3 rounded-lg bg-secondary/22 px-3 py-2 text-xs font-medium text-foreground" role="status">{message}</p>}
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" disabled={selfApproval} onClick={() => decide("revision_requested")}><RotateCcw data-icon="inline-start" /> Request revision</Button><Button disabled={selfApproval} onClick={() => decide("approved")} className="bg-gradient-to-br from-primary to-accent text-primary-foreground"><CheckCircle2 data-icon="inline-start" /> Approve version</Button></div>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

type PersistentReviewFile = { id: string; file_name: string; mime_type: string; size_bytes: number }
type PersistentSubmission = {
  submissionId: string; versionId: string; versionNumber: number; contentItemId: string; title: string;
  clientName: string; clientId: string; platform: string; contentType: string; deadlineAt: string | null;
  submittedBy: string; submittedAt: string; notes: string; files: PersistentReviewFile[]
}

function PersistentReviewWorkspace({ realtimeRevision }: { realtimeRevision: number }) {
  const [queueType, setQueueType] = useState<"tasks" | "content">("tasks")
  return <>
    <div className="mx-auto flex max-w-[1480px] items-center gap-2 px-4 pt-5 sm:px-6 lg:px-8">
      <Button type="button" size="sm" variant={queueType === "tasks" ? "default" : "outline"} onClick={() => setQueueType("tasks")}>Task submissions</Button>
      <Button type="button" size="sm" variant={queueType === "content" ? "default" : "outline"} onClick={() => setQueueType("content")}>Content submissions</Button>
    </div>
    {queueType === "tasks" ? <PersistentTaskReviewQueue realtimeRevision={realtimeRevision} /> : <PersistentContentReviewQueue />}
  </>
}

type TaskReviewFile = { id: string; file_name: string; mime_type: string; size_bytes: number }
type TaskReviewSubmission = {
  submissionId: string; versionId: string; versionNumber: number; taskId: string; title: string;
  clientId: string; clientName: string; campaignName: string; priority: string; dueAt: string | null;
  submittedBy: string; submittedAt: string; notes: string; files: TaskReviewFile[]
}

function PersistentTaskReviewQueue({ realtimeRevision }: { realtimeRevision: number }) {
  const [items, setItems] = useState<TaskReviewSubmission[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [comment, setComment] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [largeImage, setLargeImage] = useState<{ url: string; name: string } | null>(null)
  const selected = items.find((item) => item.versionId === selectedId) ?? items[0] ?? null

  const loadQueue = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/tasks/reviews", { cache: "no-store" })
      const payload = await response.json() as { submissions?: TaskReviewSubmission[]; error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not load task submissions.")
      setItems(payload.submissions ?? [])
      setSelectedId((current) => payload.submissions?.some((item) => item.versionId === current) ? current : payload.submissions?.[0]?.versionId ?? null)
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load task submissions.")
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => { if (active) void loadQueue() }, 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [loadQueue])
  useEffect(() => {
    if (realtimeRevision === 0) return
    const timer = window.setTimeout(() => { void loadQueue() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadQueue, realtimeRevision])
  useEffect(() => {
    if (!largeImage) return
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") setLargeImage(null) }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [largeImage])

  async function decide(decision: "approved" | "revision_requested") {
    if (!selected || saving) return
    if (decision === "revision_requested" && !comment.trim()) {
      setMessage("Add clear revision feedback before requesting changes.")
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/tasks/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: selected.versionId, decision, comment }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not save the task review decision.")
      setComment("")
      setMessage(decision === "approved" ? "Task version approved. The owner can now complete the task." : "Revision requested. The owner can upload a new version.")
      await loadQueue()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the task review decision.")
    } finally { setSaving(false) }
  }

  return <main className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Supervisor workspace</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">Task review queue</h1><p className="mt-1 text-sm text-muted-foreground">Review the submitted task files. Approval is separate from marking the task complete.</p></div><Button type="button" variant="outline" size="sm" onClick={() => void loadQueue()} disabled={loading}>Refresh queue</Button></div>
    {message && !selected && <p role="status" className="mt-4 rounded-md border border-border bg-background/60 px-3 py-2 text-xs">{message}</p>}
    <div className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="glass-panel rounded-2xl border p-3"><div className="flex items-center justify-between px-2 py-2"><div><h2 className="text-sm font-semibold">Awaiting review</h2><p className="text-[11px] text-muted-foreground">Oldest submissions first</p></div><Badge className="bg-primary text-primary-foreground">{items.length}</Badge></div>
        {loading && !items.length ? <p className="p-4 text-xs text-muted-foreground">Loading task submissions…</p> : !items.length ? <ContentState variant="empty" title={message ? "Review queue unavailable" : "Queue cleared"} description={message ?? "There are no task submissions waiting for review."} compact /> : <div className="mt-2 space-y-2">{items.map((item) => <button key={item.versionId} type="button" onClick={() => { setSelectedId(item.versionId); setMessage(null); setComment("") }} className={cn("w-full rounded-xl border p-3 text-left transition", selected?.versionId === item.versionId ? "border-primary/40 bg-secondary/28 shadow-sm" : "border-transparent bg-background/48 hover:border-primary/15")}><span className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 text-[10px] font-bold text-primary">{item.submittedBy.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{item.title}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{item.clientName} · V{item.versionNumber}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">From {item.submittedBy}</span></span><Clock3 className="size-3.5 text-primary" /></span></button>)}</div>}
      </aside>
      {!selected ? <div>{message && <p role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{message}</p>}<ContentState variant={loading ? "loading" : "empty"} title={loading ? "Loading task review queue" : "Select a submission"} description={loading ? "Fetching submitted task files." : "Choose a task submission to review."} /></div> : <section className="min-w-0 space-y-5">
        <div className="glass-panel rounded-2xl border p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Version {selected.versionNumber}</Badge><Badge className="bg-accent/18 text-[#765126] dark:text-accent">Awaiting review</Badge><Badge variant="outline" className="capitalize">{selected.priority} priority</Badge></div><h2 className="mt-3 text-xl font-semibold">{selected.title}</h2><p className="mt-1 text-sm text-muted-foreground">{selected.clientName} · {selected.campaignName}</p></div><div className="text-left text-xs text-muted-foreground sm:text-right"><p className="font-semibold text-foreground">Submitted by {selected.submittedBy}</p><p className="mt-1">{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(selected.submittedAt))}</p>{selected.dueAt && <p className="mt-1">Due {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(selected.dueAt))}</p>}</div></div>
          {selected.notes && <p className="mt-4 rounded-lg bg-background/60 p-3 text-xs leading-5"><span className="font-semibold">Submission notes:</span> {selected.notes}</p>}
          <div className="mt-4 grid gap-3 md:grid-cols-2">{selected.files.map((file) => { const previewUrl = `/api/files/${encodeURIComponent(file.id)}?inline=1`; const isImage = file.mime_type.startsWith("image/"); const isVideo = file.mime_type.startsWith("video/"); return <article key={file.id} className="overflow-hidden rounded-xl border bg-background/60">{isImage && <button type="button" className="block h-64 w-full cursor-zoom-in bg-muted/25" aria-label={`View larger image: ${file.file_name}`} onClick={() => setLargeImage({ url: previewUrl, name: file.file_name })}><Image src={previewUrl} alt={file.file_name} width={1000} height={700} unoptimized className="size-full object-contain" /></button>}{isVideo && <video src={previewUrl} controls preload="metadata" playsInline className="h-64 w-full bg-black object-contain" aria-label={`Video: ${file.file_name}`}>Your browser cannot play this video format.</video>}<div className="flex items-center justify-between gap-2 p-3"><span className="min-w-0"><span className="block truncate text-xs font-semibold">{file.file_name}</span><span className="text-[10px] text-muted-foreground">{file.mime_type} · {(file.size_bytes / 1048576).toFixed(1)} MB</span></span><a href={`/api/files/${encodeURIComponent(file.id)}`} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-muted/50"><Download className="size-3.5" />Download</a></div></article> })}{!selected.files.length && <ContentState variant="error" title="Submitted files unavailable" description="The linked file metadata could not be loaded. Refresh or contact an administrator." compact />}</div>
        </div>
        <div className="glass-panel rounded-2xl border p-4 sm:p-5"><h3 className="text-sm font-semibold">Review decision</h3><label className="mt-3 block text-xs font-semibold">Feedback<textarea value={comment} onChange={(event) => { setComment(event.target.value); setMessage(null) }} maxLength={5000} placeholder="Explain approval or list the exact changes needed…" className="mt-2 min-h-24 w-full resize-y rounded-xl border border-primary/20 bg-background/70 p-3 text-sm font-normal outline-none focus:border-primary focus:ring-3 focus:ring-primary/10" /></label>{message && <p className="mt-3 rounded-lg bg-secondary/22 px-3 py-2 text-xs font-medium" role="status">{message}</p>}<p className="mt-2 text-[10px] text-muted-foreground">Feedback is required when requesting changes. You cannot review your own submission.</p><div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={saving || !comment.trim()} onClick={() => void decide("revision_requested")}><RotateCcw data-icon="inline-start" /> Request changes</Button><Button type="button" disabled={saving} onClick={() => void decide("approved")} className="bg-gradient-to-br from-primary to-accent text-primary-foreground">{saving ? "Saving…" : <><CheckCircle2 data-icon="inline-start" /> Approve</>}</Button></div></div>
      </section>}
    </div>
    {largeImage && <div role="dialog" aria-modal="true" aria-label={`Image preview: ${largeImage.name}`} onClick={() => setLargeImage(null)} className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 sm:p-8"><button type="button" onClick={() => setLargeImage(null)} aria-label="Close image preview" className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white"><X className="size-5" /></button><Image src={largeImage.url} alt={largeImage.name} width={2000} height={1600} unoptimized onClick={(event) => event.stopPropagation()} className="max-h-[85vh] max-w-[92vw] cursor-default object-contain" /></div>}
  </main>
}

function PersistentContentReviewQueue() {
  const [items, setItems] = useState<PersistentSubmission[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [comment, setComment] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [largeImage, setLargeImage] = useState<{ url: string; name: string } | null>(null)
  const selected = items.find((item) => item.versionId === selectedId) ?? items[0] ?? null

  const loadQueue = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/content/reviews", { cache: "no-store" })
      const payload = await response.json() as { submissions?: PersistentSubmission[]; error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not load the review queue.")
      setItems(payload.submissions ?? [])
      setSelectedId((current) => payload.submissions?.some((item) => item.versionId === current) ? current : payload.submissions?.[0]?.versionId ?? null)
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the review queue.")
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => { if (active) void loadQueue() }, 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [loadQueue])
  useEffect(() => {
    if (!largeImage) return
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") setLargeImage(null) }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [largeImage])

  async function decide(decision: "approved" | "revision_requested") {
    if (!selected || saving) return
    if (decision === "revision_requested" && !comment.trim()) {
      setMessage("Add feedback before requesting changes.")
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/content/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: selected.versionId, decision, comment }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not save the review decision.")
      setComment("")
      setMessage(decision === "approved" ? "Content approved." : "Changes requested and returned to the Account Manager.")
      await loadQueue()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the review decision.")
    } finally { setSaving(false) }
  }

  return <main className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Supervisor workspace</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">Content review queue</h1><p className="mt-1 text-sm text-muted-foreground">Review the exact files submitted for each content item.</p></div>
      <Button type="button" variant="outline" size="sm" onClick={() => void loadQueue()} disabled={loading}>Refresh queue</Button>
    </div>
    {message && !selected && <p role="status" className="mt-4 rounded-md border border-border bg-background/60 px-3 py-2 text-xs">{message}</p>}
    <div className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="glass-panel rounded-2xl border p-3">
        <div className="flex items-center justify-between px-2 py-2"><div><h2 className="text-sm font-semibold">Awaiting review</h2><p className="text-[11px] text-muted-foreground">Oldest submissions first</p></div><Badge className="bg-primary text-primary-foreground">{items.length}</Badge></div>
        {loading && !items.length ? <p className="p-4 text-xs text-muted-foreground">Loading submissions…</p> : !items.length ? <ContentState variant="empty" title="Queue cleared" description={message ?? "There are no content submissions waiting for review."} compact /> : <div className="mt-2 space-y-2">{items.map((item) => <button key={item.versionId} type="button" onClick={() => { setSelectedId(item.versionId); setMessage(null); setComment("") }} className={cn("w-full rounded-xl border p-3 text-left transition", selected?.versionId === item.versionId ? "border-primary/40 bg-secondary/28 shadow-sm" : "border-transparent bg-background/48 hover:border-primary/15")}><span className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 text-[10px] font-bold text-primary">{item.submittedBy.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{item.title}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{item.clientName} · V{item.versionNumber}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">From {item.submittedBy}</span></span></span></button>)}</div>}
      </aside>

      {!selected ? <div>{message && <p role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{message}</p>}<ContentState variant={loading ? "loading" : "empty"} title={loading ? "Loading review queue" : "Select a submission"} description={loading ? "Fetching submitted content and files." : "Choose a queued content item to review."} /></div> : <section className="min-w-0 space-y-5">
        <div className="glass-panel rounded-2xl border p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Version {selected.versionNumber}</Badge><Badge className="bg-accent/18 text-[#765126] dark:text-accent">Awaiting review</Badge></div><h2 className="mt-3 text-xl font-semibold">{selected.title}</h2><p className="mt-1 text-sm text-muted-foreground">{selected.clientName} · {selected.platform} · {selected.contentType}</p></div><div className="text-left text-xs text-muted-foreground sm:text-right"><p className="font-semibold text-foreground">Submitted by {selected.submittedBy}</p><p className="mt-1">{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(selected.submittedAt))}</p>{selected.deadlineAt && <p className="mt-1">Deadline: {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(`${selected.deadlineAt}T12:00:00`))}</p>}</div></div>
          {selected.notes && <p className="mt-4 rounded-lg bg-background/60 p-3 text-xs leading-5"><span className="font-semibold">Submission notes:</span> {selected.notes}</p>}
          <div className="mt-4 space-y-3">{selected.files.map((file) => {
            const previewUrl = `/api/files/${encodeURIComponent(file.id)}?inline=1`
            const isImage = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mime_type)
            const isVideo = ["video/mp4", "video/webm", "video/quicktime"].includes(file.mime_type)
            return <article key={file.id} className="overflow-hidden rounded-xl border bg-background/60">
              {isImage && <button type="button" className="block max-h-[70vh] w-full cursor-zoom-in bg-muted/25" aria-label={`View larger image: ${file.file_name}`} onClick={() => setLargeImage({ url: previewUrl, name: file.file_name })}><Image src={previewUrl} alt={file.file_name} width={1600} height={1200} unoptimized className="mx-auto max-h-[70vh] w-full object-contain" /></button>}
              {isVideo && <video src={previewUrl} controls preload="metadata" playsInline className="max-h-[70vh] w-full bg-black" aria-label={`Video: ${file.file_name}`}>Your browser cannot play this video format.</video>}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3"><span className="min-w-0"><span className="block truncate text-xs font-semibold">{file.file_name}</span><span className="text-[10px] text-muted-foreground">{file.mime_type} · {(file.size_bytes / 1048576).toFixed(1)} MB</span></span><a href={`/api/files/${encodeURIComponent(file.id)}`} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-muted/50"><Download className="size-3.5" />Download</a></div>
            </article>
          })}{!selected.files.length && <ContentState variant="error" title="Submitted files unavailable" description="The linked file metadata could not be loaded. Refresh or contact an administrator." compact />}</div>
        </div>
        <div className="glass-panel rounded-2xl border p-4 sm:p-5">
          <h3 className="text-sm font-semibold">Review decision</h3>
          <label className="mt-3 block text-xs font-semibold">Feedback<textarea value={comment} onChange={(event) => { setComment(event.target.value); setMessage(null) }} maxLength={5000} placeholder="Explain approval or list the exact changes needed…" className="mt-2 min-h-24 w-full resize-y rounded-xl border border-primary/20 bg-background/70 p-3 text-sm font-normal outline-none focus:border-primary focus:ring-3 focus:ring-primary/10" /></label>
          {message && <p className="mt-3 rounded-lg bg-secondary/22 px-3 py-2 text-xs font-medium" role="status">{message}</p>}
          <p className="mt-2 text-[10px] text-muted-foreground">Feedback is required when requesting changes. You cannot review your own submission.</p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={saving || !comment.trim()} onClick={() => void decide("revision_requested")}><RotateCcw data-icon="inline-start" /> Request changes</Button><Button type="button" disabled={saving} onClick={() => void decide("approved")} className="bg-gradient-to-br from-primary to-accent text-primary-foreground"><CheckCircle2 data-icon="inline-start" /> Approve</Button></div>
        </div>
      </section>}
    </div>
    {largeImage && <div role="dialog" aria-modal="true" aria-label={`Image preview: ${largeImage.name}`} onClick={() => setLargeImage(null)} className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 sm:p-8"><button type="button" onClick={() => setLargeImage(null)} aria-label="Close image preview" className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white"><X className="size-5" /></button><Image src={largeImage.url} alt={largeImage.name} width={2000} height={1600} unoptimized onClick={(event) => event.stopPropagation()} className="max-h-[85vh] max-w-[92vw] cursor-default object-contain" /></div>}
  </main>
}

function Info({ icon: Icon, label, value }: { icon: typeof ShieldCheck; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-primary/14 bg-background/55 p-3"><span className="grid size-8 place-items-center rounded-lg bg-secondary/30 text-primary"><Icon className="size-4" /></span><span><span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span><span className="mt-0.5 block text-xs font-semibold">{value}</span></span></div>
}
