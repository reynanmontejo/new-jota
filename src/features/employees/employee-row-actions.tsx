"use client"

import { useRef } from "react"
import { MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react"

import { moveEmployeeToTrash, setEmployeeActiveState } from "@/app/employees/actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function EmployeeRowActions({
  employeeId,
  employeeName,
  employeeEmail,
  status,
  updateFormId,
  canEdit,
  canChangeStatus,
  canDelete,
}: {
  employeeId: string
  employeeName: string
  employeeEmail: string
  status: "invited" | "active" | "inactive"
  updateFormId: string
  canEdit: boolean
  canChangeStatus: boolean
  canDelete: boolean
}) {
  const deleteDialog = useRef<HTMLDialogElement>(null)
  const statusForm = useRef<HTMLFormElement>(null)
  const hasActions = canEdit || canChangeStatus || canDelete

  function submitUpdateForm() {
    const form = document.getElementById(updateFormId)
    if (form instanceof HTMLFormElement) form.requestSubmit()
  }

  if (!hasActions) return null

  return <>
    <form ref={statusForm} action={setEmployeeActiveState} hidden>
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="status" value={status === "active" ? "inactive" : "active"} />
    </form>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${employeeName}`} className="size-8 rounded-full text-muted-foreground hover:bg-secondary/60 hover:text-foreground" />}>
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44 rounded-lg p-1.5">
        {canEdit && <DropdownMenuItem onClick={submitUpdateForm} className="min-h-8 rounded-md px-2 text-xs">
          <Pencil className="size-3.5" /> Save changes
        </DropdownMenuItem>}
        {canChangeStatus && status !== "invited" && <>
          {canEdit && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={() => statusForm.current?.requestSubmit()} className="min-h-8 rounded-md px-2 text-xs">
            <Power className="size-3.5" /> {status === "active" ? "Deactivate account" : "Reactivate account"}
          </DropdownMenuItem>
        </>}
        {canDelete && <>
          {(canEdit || (canChangeStatus && status !== "invited")) && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={() => deleteDialog.current?.showModal()} className="min-h-8 rounded-md px-2 text-xs text-destructive focus:text-destructive">
            <Trash2 className="size-3.5" /> Move to Trash
          </DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>

    <dialog ref={deleteDialog} aria-labelledby={`delete-title-${employeeId}`} className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/45">
      <form action={moveEmployeeToTrash} className="grid gap-3 p-4">
        <input type="hidden" name="employeeId" value={employeeId} />
        <div>
          <h2 id={`delete-title-${employeeId}`} className="text-sm font-semibold">Move {employeeName} to Trash?</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">This immediately blocks sign-in and schedules permanent removal in 30 days. The account can be restored during that period.</p>
        </div>
        <label className="grid gap-1 text-xs font-medium">Confirm with employee email
          <input className="h-9 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" name="confirmationEmail" type="email" required autoComplete="off" placeholder={employeeEmail} />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => deleteDialog.current?.close()}>Cancel</Button>
          <Button type="submit" size="sm" variant="destructive">Move to Trash</Button>
        </div>
      </form>
    </dialog>
  </>
}
