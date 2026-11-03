"use client"

import { useRef } from "react"
import { Trash2 } from "lucide-react"

import { permanentlyDeleteEmployee } from "@/app/employees/actions"
import { Button } from "@/components/ui/button"
import { EmployeeFormActions } from "./employee-form-actions"

export function EmployeeTrashDelete({ employeeId, employeeName, employeeEmail }: {
  employeeId: string; employeeName: string; employeeEmail: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  return <>
    <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => dialog.current?.showModal()}>
      <Trash2 aria-hidden="true" className="size-3.5" />Delete permanently
    </Button>
    <dialog ref={dialog} aria-labelledby={`purge-title-${employeeId}`} className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/45">
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
    </dialog>
  </>
}
