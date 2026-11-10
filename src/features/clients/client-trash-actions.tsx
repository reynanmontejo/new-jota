"use client"

import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { LoaderCircle, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react"
import { permanentlyDeleteClientFromTrash, restoreClientFromTrash } from "@/app/clients/actions"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function ClientTrashActions({ clientId, clientName, canDelete, onDeleted }: {
  clientId: string; clientName: string; canDelete: boolean; onDeleted: () => void
}) {
  const [restoring, startRestore] = useTransition()
  const dialog = useRef<HTMLDialogElement>(null)
  const [confirmation, setConfirmation] = useState("")
  const [result, deleteAction, deleting] = useActionState(permanentlyDeleteClientFromTrash, {})
  useEffect(() => { if (result.deleted) onDeleted() }, [result.deleted, onDeleted])
  function restore() {
    const data = new FormData()
    data.set("clientId", clientId)
    startRestore(async () => { await restoreClientFromTrash(data) })
  }
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" disabled={restoring || deleting} aria-busy={restoring || deleting} aria-label={`Trash actions for ${clientName}`} className="size-11 shrink-0 rounded-full text-muted-foreground hover:bg-secondary/60 hover:text-foreground" />}>
        {restoring || deleting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <MoreHorizontal aria-hidden="true" className="size-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48 rounded-lg p-1.5">
        <DropdownMenuItem onClick={restore} className="min-h-11 rounded-md px-2 text-xs"><RotateCcw aria-hidden="true" className="size-3.5" />Restore client</DropdownMenuItem>
        {canDelete && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => { setConfirmation(""); dialog.current?.showModal() }} className="min-h-11 rounded-md px-2 text-xs"><Trash2 aria-hidden="true" className="size-3.5" />Delete permanently</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
    <span role="status" className="sr-only">{restoring ? "Restoring client…" : deleting ? "Deleting client…" : ""}</span>
    {canDelete && <dialog ref={dialog} onCancel={event => { if (deleting) event.preventDefault() }} aria-labelledby={`delete-client-${clientId}`} className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/45">
      <form action={deleteAction} className="grid gap-4 p-5" aria-busy={deleting}>
        <input type="hidden" name="clientId" value={clientId} />
        <div><h2 id={`delete-client-${clientId}`} className="text-base font-semibold">Permanently delete {clientName}?</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">This deletes the client and its campaigns, content, tasks, comments, reviews, meetings, and file records from Jota. Google Drive copies remain in Drive. This cannot be undone.</p></div>
        <label className="grid gap-2 text-xs font-medium">Type {clientName} to confirm
          <input name="confirmationName" type="text" required maxLength={140} autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={deleting} className="min-h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        {result.error && <p role="alert" className="text-xs leading-5 text-destructive">{result.error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={deleting} onClick={() => dialog.current?.close()} className="min-h-11">Cancel</Button><Button type="submit" variant="destructive" disabled={deleting || confirmation.trim() !== clientName} className="min-h-11">{deleting && <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}{deleting ? "Deleting…" : "Delete permanently"}</Button></div>
      </form>
    </dialog>}
  </>
}
