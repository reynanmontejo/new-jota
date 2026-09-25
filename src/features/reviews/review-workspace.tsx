"use client"

import { useMemo, useState } from "react"
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
} from "lucide-react"

import { ContentState } from "@/components/states/content-state"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useWorkflow } from "@/features/workflow/workflow-provider"
import { cn } from "@/lib/utils"

const reviewer = { id: "sarah", name: "Sarah Chen", initials: "SC" }

export function ReviewWorkspace() {
  const { tasks, reviewLatestVersion } = useWorkflow()
  const queue = useMemo(() => tasks.filter((task) => task.versions.at(-1)?.status === "submitted"), [tasks])
  const [selectedId, setSelectedId] = useState<string | null>(queue[0]?.id ?? null)
  const [comment, setComment] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const selectedTask = queue.find((task) => task.id === selectedId) ?? queue[0]
  const latestVersion = selectedTask?.versions.at(-1)
  const selfApproval = latestVersion?.submittedById === reviewer.id

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
        <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Supervisor workspace</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">Review queue</h1><p className="mt-1 text-sm text-muted-foreground">Inspect submitted work and record a clear decision.</p></div>
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

function Info({ icon: Icon, label, value }: { icon: typeof ShieldCheck; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-primary/14 bg-background/55 p-3"><span className="grid size-8 place-items-center rounded-lg bg-secondary/30 text-primary"><Icon className="size-4" /></span><span><span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span><span className="mt-0.5 block text-xs font-semibold">{value}</span></span></div>
}
