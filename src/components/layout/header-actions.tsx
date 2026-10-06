"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, CheckCheck, ClipboardCheck, LogOut, Plus, Search, Settings, UserRound } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeModeToggle } from "@/components/layout/theme-mode-toggle"
import { useWorkflow } from "@/features/workflow/workflow-provider"

const newTaskEvent = "jota:new-task"

export function openNewTaskDialog() {
  window.dispatchEvent(new Event(newTaskEvent))
}

type HeaderActionsProps = {
  persona: { initials: string; name: string; role: string }
  onOpenMobileSearch: () => void
}

const clients = [
  { id: "luma-skincare", name: "Luma Skincare", campaign: "Autumn Glow Launch" },
  { id: "northwind-coffee", name: "Northwind Coffee", campaign: "Cold Brew Stories" },
  { id: "harbor-and-pine", name: "Harbor & Pine", campaign: "Fall Editorial" },
  { id: "sunday-studio", name: "Sunday Studio", campaign: "Member Stories" },
]

export function HeaderActions({ persona, onOpenMobileSearch }: HeaderActionsProps) {
  const router = useRouter()
  const { createTask } = useWorkflow()
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [unread, setUnread] = useState(2)

  useEffect(() => {
    const open = () => setNewTaskOpen(true)
    window.addEventListener(newTaskEvent, open)
    return () => window.removeEventListener(newTaskEvent, open)
  }, [])

  return (
    <>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="icon" className="border-primary/25 bg-background/70 md:hidden" aria-label="Search" onClick={onOpenMobileSearch}><Search /></Button>
        <Button aria-label="Create new task" onClick={() => setNewTaskOpen(true)} className="h-9 rounded-xl border border-background/55 bg-gradient-to-br from-primary to-accent px-3.5 text-primary-foreground shadow-[0_12px_24px_-12px_rgb(175_134_83/78%)] hover:from-[#9d7648] hover:to-primary"><Plus data-icon="inline-start" /><span className="hidden sm:inline">New task</span></Button>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative rounded-xl" aria-label="Notifications" />}>
            <Bell className="size-[18px]" />
            {unread > 0 && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent ring-2 ring-background" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-80 rounded-xl border border-primary/16 bg-popover/95 p-2 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between px-2 py-1"><DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>{unread > 0 && <button onClick={() => setUnread(0)} className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"><CheckCheck className="size-3" /> Mark all read</button>}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setUnread((value) => Math.max(0, value - 1)); router.push("/tasks/upload-carousel-design-v2") }} className="items-start rounded-lg p-2.5"><span className="mt-1 size-2 shrink-0 rounded-full bg-accent" /><span><span className="block text-xs font-semibold">Revision requested</span><span className="mt-1 block text-[11px] leading-4 text-muted-foreground">Carousel V1 needs updates on slides 4–6.</span></span></DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setUnread((value) => Math.max(0, value - 1)); router.push("/reviews") }} className="items-start rounded-lg p-2.5"><span className="mt-1 size-2 shrink-0 rounded-full bg-primary" /><span><span className="block text-xs font-semibold">Submission ready</span><span className="mt-1 block text-[11px] leading-4 text-muted-foreground">Founder story reel is awaiting review.</span></span></DropdownMenuItem>
            {unread === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">You’re all caught up.</p>}
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeModeToggle />
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger render={<button className="flex items-center gap-2 rounded-xl p-1 text-left transition hover:bg-muted" aria-label="Open user menu" />}>
            <Avatar className="size-8"><AvatarFallback className="bg-gradient-to-br from-secondary/55 to-accent/65 text-xs font-semibold text-foreground ring-1 ring-background">{persona.initials}</AvatarFallback></Avatar>
            <span className="hidden pr-1 xl:block"><span className="block text-xs font-semibold leading-tight">{persona.name}</span><span className="block text-[11px] text-muted-foreground">{persona.role}</span></span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-52 rounded-xl border border-primary/16 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
            <DropdownMenuLabel><span className="block text-xs text-foreground">{persona.name}</span><span className="font-normal text-muted-foreground">{persona.role}</span></DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/tasks")} className="rounded-lg"><UserRound /> My tasks</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/reviews")} className="rounded-lg"><ClipboardCheck /> Supervisor review</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")} className="rounded-lg"><Settings /> Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="rounded-lg text-muted-foreground"><LogOut /> Sign out <Badge variant="outline" className="ml-auto text-[8px]">Phase 4</Badge></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {newTaskOpen && <NewTaskDialog onClose={() => setNewTaskOpen(false)} onCreate={(input) => { void createTask(input).then((id) => { if (!id) return; setNewTaskOpen(false); router.push(`/tasks/${id}`) }) }} />}
    </>
  )
}

function NewTaskDialog({ onClose, onCreate }: { onClose: () => void; onCreate: Parameters<ReturnType<typeof useWorkflow>["createTask"]>[0] extends never ? never : (input: Parameters<ReturnType<typeof useWorkflow>["createTask"]>[0]) => void }) {
  const [title, setTitle] = useState("")
  const [clientId, setClientId] = useState(clients[0].id)
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium")
  const [dueDate, setDueDate] = useState("2026-09-26")
  const selectedClient = useMemo(() => clients.find((client) => client.id === clientId) ?? clients[0], [clientId])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim()) return
    const formattedDate = new Date(`${dueDate}T17:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    onCreate({ title: title.trim(), clientId, clientName: selectedClient.name, campaign: selectedClient.campaign, priority, dueDate: `${formattedDate} · 5:00 PM` })
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#141311]/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="new-task-title" className="glass-panel w-full max-w-lg rounded-2xl border p-5 shadow-2xl">
        <div className="flex items-start justify-between"><div><h2 id="new-task-title" className="text-lg font-semibold">Create a new task</h2><p className="mt-1 text-xs text-muted-foreground">Add the essentials now. Details can be completed on the task page.</p></div><button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted" aria-label="Close new task dialog">×</button></div>
        <div className="mt-5 space-y-4">
          <label className="block text-xs font-semibold">Task title<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-primary/20 bg-background/75 px-3 text-sm font-normal outline-none focus:border-primary focus:ring-3 focus:ring-primary/10" placeholder="e.g. Prepare October performance report" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold">Client<select value={clientId} onChange={(event) => setClientId(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-primary/20 bg-background/75 px-3 text-sm font-normal outline-none">{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label className="block text-xs font-semibold">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)} className="mt-2 h-10 w-full rounded-xl border border-primary/20 bg-background/75 px-3 text-sm font-normal capitalize outline-none"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label></div>
          <label className="block text-xs font-semibold">Due date<input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-primary/20 bg-background/75 px-3 text-sm font-normal outline-none" /></label>
        </div>
        <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" className="bg-gradient-to-br from-primary to-accent text-primary-foreground"><Plus data-icon="inline-start" /> Create task</Button></div>
      </form>
    </div>
  )
}
