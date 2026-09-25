import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  FolderKanban,
  MoreHorizontal,
  Sparkles,
} from "lucide-react"
import Link from "next/link"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

const metrics = [
  {
    label: "Due today",
    value: "4",
    detail: "2 high priority",
    tone: "text-primary",
    surface: "bg-gradient-to-br from-secondary/55 to-background/80",
    icon: Clock3,
  },
  {
    label: "Remaining",
    value: "12",
    detail: "Across 5 clients",
    tone: "text-foreground/70",
    surface: "bg-gradient-to-br from-primary/14 to-background/90",
    icon: FolderKanban,
  },
  {
    label: "In review",
    value: "3",
    detail: "1 updated today",
    tone: "text-[#80613b] dark:text-accent",
    surface: "bg-gradient-to-br from-accent/35 to-background/85",
    icon: FileCheck2,
  },
  {
    label: "Changes requested",
    value: "2",
    detail: "Needs your attention",
    tone: "text-[#7f5136] dark:text-secondary",
    surface: "bg-gradient-to-br from-secondary/62 to-accent/18",
    icon: CircleAlert,
  },
]

const tasks = [
  {
    id: "finalize-launch-day-captions",
    title: "Finalize launch-day captions",
    client: "Luma Skincare",
    campaign: "Autumn Glow Launch",
    due: "10:30 AM",
    priority: "High",
    status: "In progress",
    dot: "bg-primary",
  },
  {
    id: "upload-carousel-design-v2",
    title: "Upload carousel design V2",
    client: "Northwind Coffee",
    campaign: "Cold Brew Stories",
    due: "1:00 PM",
    priority: "Urgent",
    status: "Changes requested",
    dot: "bg-accent",
  },
  {
    id: "review-october-content-brief",
    title: "Review October content brief",
    client: "Harbor & Pine",
    campaign: "Fall Editorial",
    due: "3:30 PM",
    priority: "Medium",
    status: "To do",
    dot: "bg-secondary",
  },
  {
    id: "prepare-campaign-performance-notes",
    title: "Prepare campaign performance notes",
    client: "Sunday Studio",
    campaign: "Member Stories",
    due: "5:00 PM",
    priority: "Medium",
    status: "To do",
    dot: "bg-[#80633f]",
  },
]

const upcoming = [
  { day: "28", month: "SEP", title: "Founder story reel", client: "Harbor & Pine", type: "Instagram" },
  { day: "30", month: "SEP", title: "Cold brew carousel", client: "Northwind Coffee", type: "LinkedIn" },
  { day: "02", month: "OCT", title: "Product spotlight", client: "Luma Skincare", type: "Facebook" },
]

const clients = [
  { initials: "LS", name: "Luma Skincare", open: 5, color: "bg-secondary/50 text-[#604726]" },
  { initials: "NC", name: "Northwind Coffee", open: 3, color: "bg-accent/35 text-[#654a28]" },
  { initials: "HP", name: "Harbor & Pine", open: 2, color: "bg-primary/20 text-[#604726]" },
]

function MetricCard({ metric }: { metric: (typeof metrics)[number] }) {
  const Icon = metric.icon

  return (
    <article className="glass-panel iso-card rounded-2xl border p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{metric.value}</p>
        </div>
        <span className={`grid size-8 place-items-center rounded-xl ${metric.surface} ${metric.tone}`}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className={`mt-2 text-[11px] font-medium ${metric.tone}`}>{metric.detail}</p>
    </article>
  )
}

export default function Home() {
  return (
    <DashboardShell>
        <main className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span>Workspace</span>
                <ChevronRight className="size-3" />
                <span className="text-foreground">Dashboard</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Good morning, Maria</h1>
              <p className="mt-1 text-sm text-muted-foreground">Here’s what needs your attention today.</p>
            </div>
            <div className="glass-panel flex items-center gap-2 self-start rounded-xl border px-3 py-2 text-sm text-muted-foreground sm:self-auto">
              <CalendarDays className="size-4 text-primary" />
              <span>Friday, September 25</span>
            </div>
          </div>

          <section aria-label="Task summary" className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
          </section>

          <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.72fr)]">
            <div className="space-y-5">
              <section id="tasks" className="glass-panel iso-card overflow-hidden rounded-2xl border">
                <div className="flex flex-col gap-3 border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div>
                    <h2 className="font-semibold tracking-tight">Today’s focus</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">4 tasks ordered by urgency and due time</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-secondary/20 p-1 text-xs font-medium shadow-inner">
                    <button className="rounded-md bg-background/90 px-2.5 py-1.5 text-foreground shadow-[0_6px_12px_-8px_rgb(94_70_41/50%)]">My tasks</button>
                    <button className="rounded-md px-2.5 py-1.5 text-muted-foreground transition hover:text-foreground">All</button>
                  </div>
                </div>
                <div className="divide-y">
                  {tasks.map((task, index) => (
                    <article
                      key={task.title}
                      className={`group grid gap-3 border-l-4 px-4 py-3 transition hover:brightness-[0.985] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-5 ${
                        index % 2 === 0
                          ? "border-l-primary/55 bg-[#fff9f1] dark:bg-[#241f19]"
                          : "border-l-accent/70 bg-[#ead5b9] dark:bg-[#33291f]"
                      }`}
                    >
                      <button
                        aria-label={`Mark ${task.title} complete`}
                        className="mt-0.5 grid size-5 place-items-center rounded-full border-2 border-border bg-background/65 text-transparent transition hover:border-primary hover:text-primary sm:mt-0"
                      >
                        <Check className="size-3" />
                      </button>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`size-1.5 shrink-0 rounded-full ${task.dot}`} />
                          <h3 className="truncate text-sm font-semibold"><Link href={`/tasks/${task.id}`} className="hover:text-primary hover:underline">{task.title}</Link></h3>
                          {index === 1 && <Badge className="border-primary/25 bg-primary/10 text-[10px] text-[#6b4d2e] dark:text-secondary">Revision</Badge>}
                        </div>
                        <p className="mt-1 truncate pl-3.5 text-xs text-muted-foreground">
                          {task.client} <span className="px-1 text-border">•</span> {task.campaign}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-4 pl-8 sm:justify-end sm:pl-0">
                        <span className={`text-xs font-medium ${task.priority === "Urgent" ? "text-[#7f5136] dark:text-secondary" : task.priority === "High" ? "text-primary" : "text-muted-foreground"}`}>
                          {task.due}
                        </span>
                        <Badge variant="outline" className="hidden min-w-24 justify-center bg-background text-[10px] font-medium text-muted-foreground md:inline-flex">
                          {task.status}
                        </Badge>
                        <Button variant="ghost" size="icon-sm" className="opacity-60 group-hover:opacity-100" aria-label={`More options for ${task.title}`}>
                          <MoreHorizontal />
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="border-t bg-muted/20 px-5 py-3 text-center">
                  <Link href="/tasks" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    View all my tasks <ArrowUpRight className="size-3.5" />
                  </Link>
                </div>
              </section>

              <section className="glass-panel iso-card rounded-2xl border p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold tracking-tight">Upcoming content</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">Next scheduled publish dates</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-primary hover:bg-secondary/20">View calendar</Button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {upcoming.map((item) => (
                    <article key={item.title} className="iso-tile rounded-xl border border-background/80 p-3.5 hover:border-accent/60">
                      <div className="flex items-start gap-3">
                        <div className="w-10 shrink-0 rounded-lg bg-gradient-to-br from-secondary/35 to-accent/55 py-1.5 text-center text-[#654a28] shadow-[0_8px_16px_-12px_rgb(175_134_83/68%)]">
                          <span className="block text-[9px] font-bold tracking-wider">{item.month}</span>
                          <span className="block text-base font-semibold leading-4">{item.day}</span>
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold">{item.title}</h3>
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">{item.client}</p>
                          <Badge variant="secondary" className="mt-2 text-[9px] font-medium">{item.type}</Badge>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="glass-panel iso-card rounded-2xl border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Weekly progress</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">18 of 24</p>
                  </div>
                  <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-secondary/35 to-accent/60 text-[#654a28] shadow-[0_10px_20px_-13px_rgb(175_134_83/72%)]">
                    <Sparkles className="size-[18px]" />
                  </span>
                </div>
                <Progress value={75} className="mt-4 h-2 bg-secondary/22 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-primary [&_[data-slot=progress-indicator]]:to-accent" />
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="font-medium text-primary">75% completed</span>
                  <span className="text-muted-foreground">6 remaining</span>
                </div>
              </section>

              <section id="clients" className="glass-panel iso-card rounded-2xl border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold tracking-tight">My clients</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">3 active accounts</p>
                  </div>
                  <Link href="/clients/luma-skincare" className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-medium text-primary hover:bg-secondary/20">
                    View more <ArrowUpRight data-icon="inline-end" />
                  </Link>
                </div>
                <div className="mt-4 space-y-1">
                  {clients.map((client) => (
                    <Link key={client.name} href="/clients/luma-skincare" className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-muted/60">
                      <Avatar className="size-9 rounded-lg">
                        <AvatarFallback className={`rounded-lg text-[11px] font-bold ${client.color}`}>{client.initials}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{client.name}</span>
                        <span className="block text-[11px] text-muted-foreground">{client.open} open tasks</span>
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </section>

              <section className="glass-panel iso-stack overflow-hidden rounded-2xl border border-background/80 bg-gradient-to-br from-background/85 to-secondary/20 p-5">
                <div className="flex items-center gap-2 text-primary">
                  <span className="grid size-7 place-items-center rounded-lg bg-background/80 shadow-[0_8px_18px_-12px_rgb(175_134_83/68%)]"><FileCheck2 className="size-4" /></span>
                  <p className="text-xs font-bold uppercase tracking-wider">Review update</p>
                </div>
                <p className="mt-3 text-sm font-semibold leading-5 text-foreground">Your “Summer recap video” was approved by Alex.</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Northwind Coffee · 18 minutes ago</p>
                <button className="mt-4 text-xs font-semibold text-primary hover:underline">View submission →</button>
              </section>
            </aside>
          </div>
        </main>
    </DashboardShell>
  )
}
