import Link from "next/link"
import { ArrowRight, BookOpenText, Clock3, Compass, LifeBuoy } from "lucide-react"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { getAuthenticatedAppUser } from "@/lib/supabase/profile"
import { helpGuideSections, helpGuides } from "@/features/help/help-guides"

const sectionDescriptions: Record<(typeof helpGuideSections)[number], string> = {
  "Start here": "Learn the basic pieces before following a workflow.",
  "Account managers": "Plan content, make tasks, submit work, and publish posts.",
  Supervisors: "Set up accounts, assign work, and review the team’s submissions.",
  Everyone: "Use shared views, files, your profile, and personal settings.",
  Administrators: "Manage workspace access, storage, and system setup.",
}

export default async function HelpPage() {
  const user = await getAuthenticatedAppUser()
  const isAdministrator = Boolean(user?.title?.toLocaleLowerCase().includes("admin"))
  const visibleGuides = helpGuides.filter((guide) => isAdministrator || guide.section !== "Administrators")

  return <DashboardShell>
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-primary/15 bg-card/75 p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><LifeBuoy className="size-6" /></span>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">Support and learning</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Help center</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Short, practical guides for the work you do in Jota. Start with the basics, then open the guide for the next step.</p></div>
      </header>

      <section className="mt-5 rounded-2xl border border-primary/15 bg-secondary/12 p-4 sm:p-5" aria-labelledby="learning-path-heading">
        <div className="flex items-center gap-2"><Compass className="size-4 text-primary" /><h2 id="learning-path-heading" className="text-sm font-semibold">Recommended learning path</h2></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {["how-jota-fits-together", "manage-content-calendar", "task-board-basics"].map((slug, index) => {
            const guide = helpGuides.find((item) => item.slug === slug)!
            return <Link key={slug} href={`/help/${guide.slug}`} className="group flex min-w-0 items-center gap-3 rounded-xl border border-primary/12 bg-background/75 p-3 transition hover:border-primary/35 hover:bg-background">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{guide.title}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{guide.audience}</span></span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          })}
        </div>
      </section>

      <div className="mt-7 space-y-8">
        {helpGuideSections.map((section) => {
          const sectionGuides = visibleGuides.filter((guide) => guide.section === section)
          if (!sectionGuides.length) return null
          return <section key={section} aria-labelledby={`help-${section.replaceAll(" ", "-").toLowerCase()}`}>
            <div className="mb-3 flex items-end justify-between gap-3"><div><h2 id={`help-${section.replaceAll(" ", "-").toLowerCase()}`} className="text-base font-semibold">{section}</h2><p className="mt-0.5 text-xs text-muted-foreground">{sectionDescriptions[section]}</p></div><span className="text-[10px] text-muted-foreground">{sectionGuides.length} {sectionGuides.length === 1 ? "guide" : "guides"}</span></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sectionGuides.map((guide) => <Link key={guide.slug} href={`/help/${guide.slug}`} className="group flex h-full min-h-36 flex-col rounded-xl border border-primary/14 bg-card/75 p-4 transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex items-start justify-between gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><BookOpenText className="size-4" /></span><span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="size-3" />{guide.minutes} min</span></span>
                <span className="mt-3 block text-sm font-semibold leading-5 group-hover:text-primary">{guide.title}</span>
                <span className="mt-1 block flex-1 text-xs leading-5 text-muted-foreground">{guide.summary}</span>
                <span className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2.5"><span className="truncate text-[10px] font-medium text-muted-foreground">{guide.audience}</span><span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-primary">Read <ArrowRight className="size-3 transition group-hover:translate-x-0.5" /></span></span>
              </Link>)}
            </div>
          </section>
        })}
      </div>

      <p className="mt-8 rounded-xl border border-border bg-card/55 px-4 py-3 text-xs leading-5 text-muted-foreground">Some actions depend on your role and client access. If a guide mentions a page or button you cannot see, ask your workspace supervisor or administrator to check your access.</p>
    </main>
  </DashboardShell>
}
