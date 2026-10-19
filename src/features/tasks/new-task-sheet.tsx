"use client"

import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useWorkflow } from "@/features/workflow/workflow-provider"
import { useTaskDrawer, type ContentTaskSeed } from "@/features/tasks/task-drawer"
import { currentEmployee } from "@/features/workflow/task-permissions"

type NewTaskSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatDueDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
  return `${day} · ${time}`
}

function defaultDueDate() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(17, 0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function contentDeadlineInput(value: string | null) {
  if (!value) return defaultDueDate()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T17:00`
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return defaultDueDate()
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T17:00`
}

export function NewTaskSheet({ open, seed, onOpenChange }: NewTaskSheetProps & { seed: ContentTaskSeed | null }) {
  const { openTask } = useTaskDrawer()
  const { createTask, clients, assignableUsers, currentUser, demoMode } = useWorkflow()
  const [submitting, setSubmitting] = useState(false)
  const initialClientId = seed?.clientId ?? ""
  const [selectedClientId, setSelectedClientId] = useState(initialClientId)
  const [assigneeId, setAssigneeId] = useState(currentUser.id)
  const [title, setTitle] = useState(seed?.title ?? "")
  const [campaignName, setCampaignName] = useState(seed?.campaignName ?? "")
  const [dueDate, setDueDate] = useState(seed ? contentDeadlineInput(seed.deadlineAt) : defaultDueDate())
  const selectedClient = clients.find((client) => client.id === selectedClientId)
  const clientMembers = demoMode && currentUser.role === "supervisor"
    ? [{ id: currentEmployee.id, name: currentEmployee.name, role: "Account Manager" }]
    : selectedClient?.members ?? []
  const organizationMembers = demoMode ? clientMembers : (assignableUsers ?? [])
  const assignableMembers = currentUser.role === "supervisor"
    ? [...(seed ? clientMembers : organizationMembers).filter((member) => member.id !== currentUser.id), { id: currentUser.id, name: currentUser.name, role: currentUser.title ?? "Supervisor" }]
    : clientMembers
  const canCreate = Boolean(assigneeId) && (!seed || Boolean(selectedClient))

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const clientId = String(form.get("clientId") ?? "")
    const client = clients.find((entry) => entry.id === clientId)
    const selectedAssignee = assignableMembers.find((member) => member.id === assigneeId)
    if ((seed && !client) || !assigneeId || (currentUser.role === "supervisor" && !selectedAssignee)) return

    setSubmitting(true)
    try {
      const taskId = await createTask({
        title: String(form.get("title")).trim(),
        clientId: clientId || null,
        clientName: client?.name ?? "No client",
        campaign: client ? String(form.get("campaign") ?? "").trim() : "",
        priority: String(form.get("priority")) as "low" | "medium" | "high" | "urgent",
        assigneeId,
        dueAt: new Date(String(form.get("dueDate"))).toISOString(),
        contentItemId: seed?.contentItemId,
        contentItemTitle: seed?.contentItemTitle,
      })
      if (!taskId) return
      formElement.reset()
      onOpenChange(false)
      openTask(taskId)
    } catch {
      // The shared workflow banner reports server validation and connection errors.
    } finally {
      setSubmitting(false)
    }
  }

  const fieldClassName =
    "mt-1.5 h-9 w-full rounded-lg border border-primary/20 bg-background px-3 text-xs outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/10"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[calc(100%-20px)] gap-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Create task</SheetTitle>
          <SheetDescription>Add an assignment directly to the team workflow.</SheetDescription>
        </SheetHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitTask}>
          <div className="grid gap-4 overflow-y-auto px-5 py-4">
            <label className="text-xs font-semibold">
              Task title
              <input
                autoFocus
                className={fieldClassName}
                name="title"
                placeholder="e.g. Finalize campaign captions"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>

            {seed ? <div className="text-xs font-semibold">Client<input type="hidden" name="clientId" value={selectedClientId} /><p className="mt-1.5 rounded-lg border border-primary/15 bg-muted/30 px-3 py-2 font-normal">{seed.clientName}</p></div> : <label className="text-xs font-semibold">
              Client <span className="font-normal text-muted-foreground">(optional)</span>
              <select className={fieldClassName} value={selectedClientId} name="clientId" onChange={(event) => {
                const nextClientId = event.target.value
                setSelectedClientId(nextClientId)
                setCampaignName("")
                if (currentUser.role === "supervisor") setAssigneeId(currentUser.id)
              }}>
                <option value="">No client</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
              {!clients.length && <span className="mt-1 block text-[11px] font-normal text-muted-foreground">You can create this task without linking a client.</span>}
            </label>}

            <label className="text-xs font-semibold">
              Campaign{!seed && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
              {seed ? <><input type="hidden" name="campaign" value={campaignName} /><p className="mt-1.5 rounded-lg border border-primary/15 bg-muted/30 px-3 py-2 font-normal">{campaignName || "General / no campaign"}</p></> : demoMode ? (
                <input className={fieldClassName} name="campaign" placeholder="Campaign or leave blank" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} />
              ) : (
                <select className={fieldClassName} key={selectedClientId} name="campaign" value={campaignName} onChange={(event) => setCampaignName(event.target.value)}>
                  <option value="">General / no campaign</option>
                  {(selectedClient?.campaigns ?? []).map((campaign) => <option key={campaign.id} value={campaign.name}>{campaign.name}</option>)}
                </select>
              )}
              {!seed && <span className="mt-1 block text-[11px] font-normal text-muted-foreground">Leave this as General / no campaign for work that isn’t tied to a campaign.</span>}
            </label>

            {currentUser.role === "supervisor" ? <label className="text-xs font-semibold">
              Assign to
              <select className={fieldClassName} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} required disabled={!assignableMembers.length}>
                {assignableMembers.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}
              </select>
              {!assignableMembers.length && <span className="mt-1 block text-[11px] font-normal text-muted-foreground">No active employees are available to assign.</span>}
            </label> : <p className="text-xs text-muted-foreground">Assigned to you</p>}

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold">
                Priority
                <select className={fieldClassName} defaultValue="medium" name="priority">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>

              <label className="text-xs font-semibold">
                Due date
                <input
                  className={fieldClassName}
                  value={dueDate}
                  name="dueDate"
                  required
                  type="datetime-local"
                  title={formatDueDate(dueDate)}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </label>
            </div>
          </div>

          <SheetFooter className="mt-auto flex-row justify-end border-t px-5 py-4">
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={submitting || !canCreate} type="submit">
              {submitting ? "Creating…" : "Create task"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
