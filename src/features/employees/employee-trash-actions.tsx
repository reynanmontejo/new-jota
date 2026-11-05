"use client"

import { useRef, useTransition } from "react"
import { LoaderCircle, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react"

import { permanentlyDeleteEmployee, restoreEmployeeFromTrash } from "@/app/employees/actions"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EmployeeFormActions } from "./employee-form-actions"

export function EmployeeTrashActions({ employeeId, employeeName, employeeEmail, canRestore, canDelete }: {
  employeeId: string; employeeName: string; employeeEmail: string; canRestore: boolean; canDelete: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [restoring, startRestore] = useTransition()
  if (!canRestore && !canDelete) return null

  function restore() {
    const formData = new FormData()
    formData.set("employeeId", employeeId)
    startRestore(async () => { await restoreEmployeeFromTrash(formData) })
  }

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" disabled={restoring} aria-busy={restoring} aria-label={`Trash actions for ${employeeName}`} className="size-11 shrink-0 rounded-full text-muted-foreground hover:bg-secondary/60 hover:text-foreground" />}>
        {restoring ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <MoreHorizontal aria-hidden="true" className="size-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48 rounded-lg p-1.5">
        {canRestore && <DropdownMenuItem onClick={restore} className="min-h-11 rounded-md px-2 text-xs"><RotateCcw aria-hidden="true" className="size-3.5" />Restore account</DropdownMenuItem>}
        {canRestore && canDelete && <DropdownMenuSeparator />}
        {canDelete && <DropdownMenuItem variant="destructive" onClick={() => dialog.current?.showModal()} className="min-h-11 rounded-md px-2 text-xs"><Trash2 aria-hidden="true" className="size-3.5" />Delete permanently</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
    <span role="status" className="sr-only">{restoring ? "Restoring account…" : ""}</span>
    {canDelete && <dialog ref={dialog} aria-labelledby={`purge-title-${employeeId}`} className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/45">
      <form action={permanentlyDeleteEmployee} className="grid gap-3 p-4">
        <input type="hidden" name="employeeId" value={employeeId} />
        <div>
          <h2 id={`purge-title-${employeeId}`} className="text-sm font-semibold">Permanently delete {employeeName}?</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">This removes their sign-in account now and anonymizes their profile. Their past tasks, comments, and review history are retained under Deleted employee. This cannot be undone.</p>
        </div>
        <label className="grid gap-1 text-xs font-medium">Confirm with employee email
          <input name="confirmationEmail" type="email" required autoComplete="off" placeholder={employeeEmail} className="h-9 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <div className="flex justify-end gap-2"><EmployeeFormActions operation="delete" onCancel={() => dialog.current?.close()} /></div>
      </form>
    </dialog>}
  </>
}
