"use client"

import { useState, type FormEvent } from "react"
import { CalendarDays, CheckCircle2, LoaderCircle } from "lucide-react"
import { scheduleClientApprovedContent } from "@/app/content/actions"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

export function ContentScheduleSheet({ item, onClose, onSaved }: {
  item: { id: string; title: string; client_name: string; platform: string; publish_at: string | null }
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const existingDate = item.publish_at ? new Date(item.publish_at) : null
  const localDate = existingDate && !Number.isNaN(existingDate.getTime())
    ? new Date(existingDate.getTime() - existingDate.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ""
  const [postingDate, setPostingDate] = useState(localDate)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const date = new Date(postingDate)
    if (!postingDate || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      setError("Choose a future posting date and time.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      // Convert the browser's local choice before crossing the server time zone.
      const result = await scheduleClientApprovedContent(item.id, date.toISOString())
      if (result.ok) onSaved()
      else setError(result.error)
    } catch { setError("The schedule could not be saved. Check your connection and try again.") }
    finally { setSaving(false) }
  }

  return <Sheet open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
    <SheetContent className="!w-screen gap-0 p-0 sm:!w-[30rem] sm:!max-w-[calc(100vw-2rem)] lg:!right-4 lg:!top-20 lg:!bottom-4 lg:!h-auto lg:!rounded-xl lg:!border" showCloseButton={!saving}>
      <SheetHeader className="border-b px-5 py-5 pr-12">
        <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-600/20 bg-emerald-600/10 px-2.5 py-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="size-3.5" />Client approved</span>
        <SheetTitle>Set posting schedule</SheetTitle>
        <SheetDescription>Choose when this approved content should be posted.</SheetDescription>
      </SheetHeader>
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div className="rounded-xl border border-primary/15 bg-primary/5 p-4"><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-xs text-muted-foreground">{item.client_name} · {item.platform}</p></div>
          <label className="grid gap-2 text-xs font-medium">Posting date and time<input autoFocus required type="datetime-local" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /></label>
          <p className="text-xs leading-5 text-muted-foreground">Times use your device’s local time zone. Saving adds the posting schedule to Content and Calendar. Your team will publish the post through the usual platform.</p>
          {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t p-5"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Schedule later</Button><Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <CalendarDays className="size-4" />}{saving ? "Saving…" : "Save posting schedule"}</Button></div>
      </form>
    </SheetContent>
  </Sheet>
}
