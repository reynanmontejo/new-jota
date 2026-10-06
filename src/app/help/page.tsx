import Link from "next/link"
import { ArrowRight, BriefcaseBusiness, CalendarDays, CircleHelp, ListTodo, UserRound } from "lucide-react"

import { DashboardShell } from "@/components/layout/dashboard-shell"

const helpLinks = [
  { href: "/tasks", label: "Tasks", detail: "Find assigned work, update progress, and review task details.", icon: ListTodo },
  { href: "/calendar", label: "Calendar", detail: "View scheduled content and important dates.", icon: CalendarDays },
  { href: "/clients", label: "Clients", detail: "Browse client workspaces, campaigns, and files.", icon: BriefcaseBusiness },
  { href: "/profile", label: "Profile", detail: "Update your name, job title, and profile details.", icon: UserRound },
]

export default function HelpPage() {
  return (
    <DashboardShell>
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md border border-primary/15 bg-primary/8 text-primary"><CircleHelp className="size-5" /></span>
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">Support</p><h1 className="mt-0.5 text-xl font-semibold tracking-tight">Help center</h1></div>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Choose a workspace area to get started. If you can’t access a feature, contact your workspace administrator.</p>
        <ul className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2">
          {helpLinks.map(({ href, label, detail, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="group flex h-full items-start gap-3 rounded-lg border border-border bg-card/80 p-4 transition hover:border-primary/35 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></span>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </DashboardShell>
  )
}
