"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  LayoutList,
  Megaphone,
  MoreHorizontal,
} from "lucide-react"

import { ContentState } from "@/components/states/content-state"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/features/workflow/status-badge"
import { useWorkflow } from "@/features/workflow/workflow-provider"
import { cn } from "@/lib/utils"

const tabs = ["overview", "campaigns", "calendar", "tasks", "files", "team", "activity"] as const
type WorkspaceTab = (typeof tabs)[number]

const tabLabels: Record<WorkspaceTab, string> = {
  overview: "Overview",
  campaigns: "Campaigns",
  calendar: "Content calendar",
  tasks: "Tasks",
  files: "Files",
  team: "Team",
  activity: "Activity",
}

const team = [
  { name: "Sarah Chen", initials: "SC", role: "Supervisor", detail: "Reviews and approvals" },
  { name: "Maria Reyes", initials: "MR", role: "Primary Account Manager", detail: "Client lead" },
  { name: "Kevin Lim", initials: "KL", role: "Copywriter", detail: "Campaign collaborator" },
  { name: "Anna Cruz", initials: "AC", role: "Designer", detail: "Campaign collaborator" },
]

const clientProfiles = {
  "luma-skincare": { name: "Luma Skincare", initials: "LS", campaign: "Autumn Glow Launch", nextContent: "Autumn launch carousel", nextChannel: "Instagram · September 28 at 2:00 PM", primaryContact: "Maria Reyes", primaryInitials: "MR" },
  "northwind-coffee": { name: "Northwind Coffee", initials: "NC", campaign: "Cold Brew Stories", nextContent: "Cold brew founder story", nextChannel: "LinkedIn · September 30 at 10:00 AM", primaryContact: "Maria Reyes", primaryInitials: "MR" },
  "harbor-and-pine": { name: "Harbor & Pine", initials: "HP", campaign: "Fall Editorial", nextContent: "October editorial reel", nextChannel: "Instagram · October 2 at 1:00 PM", primaryContact: "Jordan Lee", primaryInitials: "JL" },
} as const

type ClientProfile = (typeof clientProfiles)[keyof typeof clientProfiles]

export function ClientWorkspace({ clientId, initialTab = "overview" }: { clientId: string; initialTab?: string }) {
  const router = useRouter()
  const client = clientProfiles[clientId as keyof typeof clientProfiles] ?? clientProfiles["luma-skincare"]
  const safeInitialTab = tabs.includes(initialTab as WorkspaceTab) ? initialTab as WorkspaceTab : "overview"
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(safeInitialTab)
  const { tasks } = useWorkflow()
  const clientTasks = tasks.filter((task) => task.clientId === clientId)

  function selectTab(tab: WorkspaceTab) {
    setActiveTab(tab)
    router.replace(`/clients/${clientId}${tab === "overview" ? "" : `?tab=${tab}`}`, { scroll: false })
  }

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="size-12 rounded-2xl">
            <AvatarFallback className="rounded-2xl bg-gradient-to-br from-secondary/55 to-accent/55 font-bold text-[#654a28]">{client.initials}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{client.name}</h1>
              <Badge className="bg-emerald-600/10 text-emerald-800 dark:text-emerald-300">Active</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Primary account · {client.campaign}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="bg-background/65">Open Drive</Button>
          <Button className="bg-gradient-to-br from-primary to-accent text-primary-foreground">Create task</Button>
        </div>
      </div>

      <nav aria-label="Client workspace" className="mt-5 flex gap-1 overflow-x-auto rounded-xl border border-primary/15 bg-background/55 p-1.5 backdrop-blur-md">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => selectTab(tab)}
            className={cn("shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition", activeTab === tab ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary/20 hover:text-foreground")}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {activeTab === "overview" && <Overview client={client} tasks={clientTasks} onViewTasks={() => selectTab("tasks")} />}
        {activeTab === "campaigns" && <Campaigns client={client} />}
        {activeTab === "calendar" && <Calendar client={client} />}
        {activeTab === "tasks" && <Tasks tasks={clientTasks} />}
        {activeTab === "files" && <Files />}
        {activeTab === "team" && <Team />}
        {activeTab === "activity" && <ActivityFeed tasks={clientTasks} />}
      </div>
    </div>
  )
}

function Overview({ client, tasks, onViewTasks }: { client: ClientProfile; tasks: ReturnType<typeof useWorkflow>["tasks"]; onViewTasks: () => void }) {
  const summary = [
    { label: "Open tasks", value: tasks.filter((task) => !["approved", "completed"].includes(task.status)).length, icon: LayoutList },
    { label: "Campaigns", value: 2, icon: Megaphone },
    { label: "Content this month", value: 8, icon: CalendarDays },
    { label: "Approved", value: 14, icon: CheckCircle2 },
  ]

  return (
    <div className="grid gap-5 xl:grid-cols-[1.45fr_.75fr]">
      <div className="space-y-5">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Client summary">
          {summary.map((item) => <article key={item.label} className="glass-panel iso-card rounded-2xl border p-4"><item.icon className="size-4 text-primary" /><p className="mt-3 text-2xl font-semibold">{item.value}</p><p className="mt-1 text-xs text-muted-foreground">{item.label}</p></article>)}
        </section>
        <section className="glass-panel overflow-hidden rounded-2xl border">
          <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Priority work</h2><p className="text-xs text-muted-foreground">Current {client.name} assignments</p></div><Button variant="ghost" size="sm" onClick={onViewTasks}>View all</Button></div>
          {tasks.length === 0 ? <ContentState variant="empty" compact /> : tasks.map((task, index) => (
            <Link key={task.id} href={`/tasks/${task.id}`} className={cn("flex items-center gap-3 border-b px-5 py-3.5 transition hover:brightness-[.98]", index % 2 ? "bg-[#ead5b9] dark:bg-[#33291f]" : "bg-[#fff9f1] dark:bg-[#241f19]")}>
              <span className="grid size-8 place-items-center rounded-xl bg-background/70 text-primary"><Clock3 className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{task.title}</span><span className="block truncate text-xs text-muted-foreground">{task.contentItem}</span></span>
              <StatusBadge status={task.status} />
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </section>
      </div>
      <aside className="space-y-5">
        <section className="glass-panel iso-card rounded-2xl border p-5"><p className="text-xs font-semibold uppercase tracking-wider text-primary">Primary contact</p><div className="mt-4 flex items-center gap-3"><Avatar><AvatarFallback className="bg-secondary/40">{client.primaryInitials}</AvatarFallback></Avatar><div><p className="text-sm font-semibold">{client.primaryContact}</p><p className="text-xs text-muted-foreground">Account Manager</p></div></div><p className="mt-4 text-sm leading-6 text-muted-foreground">Owns client communication, priorities, and campaign delivery.</p></section>
        <section className="glass-panel iso-stack rounded-2xl border p-5"><p className="text-xs font-semibold uppercase tracking-wider text-primary">Next publish</p><p className="mt-3 text-lg font-semibold">{client.nextContent}</p><p className="mt-1 text-sm text-muted-foreground">{client.nextChannel}</p></section>
      </aside>
    </div>
  )
}

function Campaigns({ client }: { client: ClientProfile }) {
  return <div className="grid gap-4 md:grid-cols-2"><CampaignCard name={client.campaign} status="Active" dates="Sep 1 – Oct 31" progress={68} /><CampaignCard name={`${client.name} Holiday Plan`} status="Draft" dates="Nov 1 – Dec 20" progress={18} /></div>
}

function CampaignCard({ name, status, dates, progress }: { name: string; status: string; dates: string; progress: number }) {
  return <article className="glass-panel iso-card rounded-2xl border p-5"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-xl bg-secondary/35 text-primary"><Megaphone className="size-5" /></span><Badge variant="outline">{status}</Badge></div><h2 className="mt-4 font-semibold">{name}</h2><p className="mt-1 text-xs text-muted-foreground">{dates}</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-secondary/20"><div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${progress}%` }} /></div><div className="mt-2 flex justify-between text-xs"><span className="text-muted-foreground">Campaign progress</span><span className="font-semibold text-primary">{progress}%</span></div></article>
}

function Calendar({ client }: { client: ClientProfile }) {
  const events = [{ date: "28", title: client.nextContent, platform: client.nextChannel.split(" · ")[0] }, { date: "02", title: "Product spotlight", platform: "Facebook" }, { date: "06", title: "Campaign follow-up", platform: "Instagram" }]
  return <section className="glass-panel rounded-2xl border p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">September–October content</h2><p className="text-xs text-muted-foreground">Publish dates remain separate from task deadlines.</p></div><CalendarDays className="size-5 text-primary" /></div><div className="mt-5 grid gap-3 md:grid-cols-3">{events.map((event) => <article key={event.title} className="iso-tile rounded-xl border p-4"><span className="text-2xl font-semibold text-primary">{event.date}</span><p className="mt-3 text-sm font-semibold">{event.title}</p><p className="mt-1 text-xs text-muted-foreground">{event.platform}</p></article>)}</div></section>
}

function Tasks({ tasks }: { tasks: ReturnType<typeof useWorkflow>["tasks"] }) {
  if (tasks.length === 0) return <ContentState variant="empty" title="No client tasks" compact />
  return <section className="glass-panel overflow-hidden rounded-2xl border"><div className="grid grid-cols-[1fr_auto] border-b px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:grid-cols-[1fr_150px_130px_auto]"><span>Task</span><span className="hidden sm:block">Due</span><span className="hidden sm:block">Status</span><span /></div>{tasks.map((task) => <Link key={task.id} href={`/tasks/${task.id}`} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b px-5 py-4 hover:bg-secondary/12 sm:grid-cols-[1fr_150px_130px_auto]"><span><span className="block text-sm font-semibold">{task.title}</span><span className="text-xs text-muted-foreground">{task.campaign}</span></span><span className="hidden text-xs text-muted-foreground sm:block">{task.dueDate.split(" · ")[0]}</span><StatusBadge status={task.status} className="hidden sm:inline-flex" /><MoreHorizontal className="size-4 text-muted-foreground" /></Link>)}</section>
}

function Files() {
  const files = [{ name: "Luma-brand-guidelines.pdf", type: "Brand assets", size: "8.2 MB" }, { name: "autumn-product-shots.zip", type: "Campaign", size: "42.7 MB" }, { name: "approved-copy-deck.docx", type: "Campaign", size: "1.1 MB" }]
  return <section className="glass-panel rounded-2xl border p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Google Drive files</h2><p className="text-xs text-muted-foreground">Metadata preview for the shared client folder.</p></div><Button size="sm">Upload</Button></div><div className="mt-4 space-y-2">{files.map((file) => <div key={file.name} className="flex items-center gap-3 rounded-xl border border-primary/12 bg-background/55 p-3"><FileText className="size-4 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{file.name}</span><span className="text-xs text-muted-foreground">{file.type}</span></span><span className="text-xs text-muted-foreground">{file.size}</span></div>)}</div></section>
}

function Team() {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{team.map((member) => <article key={member.name} className="glass-panel iso-card rounded-2xl border p-5"><Avatar className="size-11"><AvatarFallback className="bg-secondary/40">{member.initials}</AvatarFallback></Avatar><h2 className="mt-4 text-sm font-semibold">{member.name}</h2><p className="mt-1 text-xs font-medium text-primary">{member.role}</p><p className="mt-3 text-xs text-muted-foreground">{member.detail}</p></article>)}</div>
}

function ActivityFeed({ tasks }: { tasks: ReturnType<typeof useWorkflow>["tasks"] }) {
  const activity = tasks.flatMap((task) => task.activity.map((item) => ({ ...item, task: task.title })))
  return <section className="glass-panel rounded-2xl border p-5"><h2 className="font-semibold">Client activity</h2><div className="mt-5 space-y-5">{activity.map((item) => <div key={item.id} className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary/30 text-primary"><Activity className="size-4" /></span><div><p className="text-sm font-medium">{item.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.task} · {item.actor} · {item.createdAt}</p></div></div>)}</div></section>
}
