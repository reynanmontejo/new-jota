"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Clock3, LoaderCircle, RotateCcw, Trash2 } from "lucide-react"
import { manageTaskTrashAction, undoTaskTrashAction } from "@/app/tasks/actions"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

export type TaskTrashItem = { task_id: string; title: string; client_name: string; deleted_at: string; ownerLabel: string; expires_at?: string | null }

export function TaskTrashManager({ items, retentionReady, referenceTime }: { items: TaskTrashItem[]; retentionReady: boolean; referenceTime?: number }) {
  const router = useRouter()
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set())
  const [pending, setPending] = useState(false)
  const [confirmationIds, setConfirmationIds] = useState<string[] | null>(null)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const visible = items.filter((item) => !removedIds.has(item.task_id))
  const [now, setNow] = useState(() => referenceTime ?? Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const restorable = visible.filter((item) => !item.expires_at || Date.parse(item.expires_at) > now)

  async function run(ids: string[], action: "restore" | "delete") {
    if (pending || !ids.length) return
    setPending(true)
    setMessage(null)
    try {
      const result = !retentionReady && action === "restore" && ids.length === 1
        ? await undoTaskTrashAction(ids[0]) : await manageTaskTrashAction(ids, action)
      if (result.error) { setMessage({ error: true, text: result.error }); return }
      setRemovedIds((current) => new Set([...current, ...ids]))
      setConfirmationIds(null)
      const count = "count" in result ? result.count : ids.length
      setMessage({ error: false, text: `${count} task${count === 1 ? "" : "s"} ${action === "restore" ? "restored to the task board" : "permanently deleted"}.` })
      router.refresh()
    } catch { setMessage({ error: true, text: "The action could not be completed. Check your connection and try again." }) }
    finally { setPending(false) }
  }

  return <>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3">
      <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Clock3 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><span>{retentionReady ? "Tasks are automatically deleted after 30 days in Trash. Restore them before their expiry date." : "Apply the unified Task Trash migration to enable bulk actions and 30-day retention."}</span></p>
      <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" disabled={!retentionReady || pending || !restorable.length} onClick={() => void run(restorable.map((item) => item.task_id), "restore")}><RotateCcw className="size-3.5" aria-hidden="true" />Restore all</Button><Button type="button" variant="destructive" disabled={!retentionReady || pending || !visible.length} onClick={() => { setMessage(null); setConfirmationIds(visible.map((item) => item.task_id)) }}><Trash2 className="size-3.5" aria-hidden="true" />Empty now</Button></div>
    </div>
    {message && !confirmationIds && <p role={message.error ? "alert" : "status"} className={`mt-3 rounded-lg border px-3 py-2 text-xs ${message.error ? "border-destructive/20 bg-destructive/5 text-destructive" : "border-emerald-600/20 bg-emerald-600/5 text-emerald-800 dark:text-emerald-200"}`}>{message.text}</p>}
    <section className="mt-4 overflow-hidden rounded-2xl border bg-card/70" aria-label="Trashed tasks">
      {!visible.length ? <div className="flex flex-col items-center p-8 text-center"><Trash2 className="mb-3 size-7 text-primary/50" aria-hidden="true" /><p className="text-sm font-medium">Task Trash is empty</p><p className="mt-1 text-xs text-muted-foreground">Use Move to Trash from a task’s menu when you want to remove it.</p></div> : <div className="divide-y">{visible.map((item) => {
        const days = item.expires_at ? Math.ceil((Date.parse(item.expires_at) - now) / 86_400_000) : null
        const expired = days !== null && days <= 0
        return <article key={item.task_id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.client_name} · {item.ownerLabel} · Moved {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(item.deleted_at))}</p>{days !== null && <p className={`mt-1 inline-flex items-center gap-1 text-[10px] font-medium ${days <= 3 ? "text-destructive" : "text-muted-foreground"}`} title={item.expires_at ? `Expiry: ${new Date(item.expires_at).toLocaleString()}` : undefined}><Clock3 className="size-3" aria-hidden="true" />{expired ? "Expired · awaiting automatic cleanup" : `Deletes in ${days} day${days === 1 ? "" : "s"}`}</p>}</div>
          <div className="flex items-center gap-1.5"><Button type="button" variant="outline" size="sm" disabled={pending || expired} onClick={() => void run([item.task_id], "restore")}><RotateCcw className="size-3.5" aria-hidden="true" />Restore</Button>{retentionReady && <Button type="button" variant="ghost" size="icon-sm" className="text-destructive" disabled={pending} aria-label={`Delete permanently: ${item.title}`} title="Delete permanently" onClick={() => { setMessage(null); setConfirmationIds([item.task_id]) }}><Trash2 className="size-3.5" aria-hidden="true" /></Button>}</div>
        </article>
      })}</div>}
    </section>
    <Sheet open={confirmationIds !== null} onOpenChange={(open) => { if (!open && !pending) setConfirmationIds(null) }}>
      <SheetContent className="!w-screen sm:!max-w-md" showCloseButton={!pending}>
        <SheetHeader><SheetTitle>{confirmationIds?.length === 1 ? "Permanently delete this task?" : "Empty Task Trash?"}</SheetTitle><SheetDescription>This permanently removes {confirmationIds?.length ?? 0} task{confirmationIds?.length === 1 ? "" : "s"} and their comments and task review history. This cannot be undone.</SheetDescription></SheetHeader>
        <p className="mx-4 rounded-lg border border-border bg-muted/25 p-3 text-xs leading-5 text-muted-foreground">Approved content snapshots and their file records are kept with the content. Private Google Drive copies are retained.</p>
        {message?.error && <p role="alert" className="mx-4 text-xs text-destructive">{message.text}</p>}
        <div className="mt-auto flex justify-end gap-2 border-t p-4"><Button type="button" variant="outline" disabled={pending} onClick={() => setConfirmationIds(null)}>Keep tasks</Button><Button type="button" variant="destructive" disabled={pending || !confirmationIds?.length} onClick={() => { if (confirmationIds) void run(confirmationIds, "delete") }}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{pending ? "Deleting…" : "Delete permanently"}</Button></div>
      </SheetContent>
    </Sheet>
  </>
}
