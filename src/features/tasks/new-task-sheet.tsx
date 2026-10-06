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
import { useTaskDrawer } from "@/features/tasks/task-drawer"

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

export function NewTaskSheet({ open, onOpenChange }: NewTaskSheetProps) {
  const { openTask } = useTaskDrawer()
  const { createTask, clients, demoMode } = useWorkflow()
  const [submitting, setSubmitting] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? "")
  const selectedClient = clients.find((client) => client.id === selectedClientId)
  const canCreate = clients.length > 0 && (demoMode || (selectedClient?.campaigns?.length ?? 0) > 0)

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const clientId = String(form.get("clientId"))
    const client = clients.find((entry) => entry.id === clientId)
    if (!client) return

    setSubmitting(true)
    setSubmitting(true)
    try {
      const taskId = await createTask({
        title: String(form.get("title")).trim(),
        clientId,
        clientName: client.name,
        campaign: String(form.get("campaign")).trim(),
        priority: String(form.get("priority")) as "low" | "medium" | "high" | "urgent",
        dueAt: new Date(String(form.get("dueDate"))).toISOString(),
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
              />
            </label>

            <label className="text-xs font-semibold">
              Client
              <select className={fieldClassName} value={selectedClientId} name="clientId" required disabled={clients.length === 0} onChange={(event) => setSelectedClientId(event.target.value)}>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              {clients.length === 0 && <span className="mt-1 block text-[11px] font-normal text-muted-foreground">No clients are assigned to your account yet.</span>}
            </label>

            <label className="text-xs font-semibold">
              Campaign
              {demoMode ? (
                <input className={fieldClassName} name="campaign" placeholder="Campaign or workstream" required />
              ) : (
                <select className={fieldClassName} key={selectedClientId} name="campaign" required disabled={!selectedClient?.campaigns?.length} defaultValue={selectedClient?.campaigns?.[0]?.name ?? ""}>
                  {(selectedClient?.campaigns ?? []).map((campaign) => <option key={campaign.id} value={campaign.name}>{campaign.name}</option>)}
                </select>
              )}
              {!demoMode && selectedClient && selectedClient.campaigns?.length === 0 && <span className="mt-1 block text-[11px] font-normal text-muted-foreground">No campaigns are available for this client.</span>}
            </label>

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
                  defaultValue={defaultDueDate()}
                  name="dueDate"
                  required
                  type="datetime-local"
                  title={formatDueDate(defaultDueDate())}
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
