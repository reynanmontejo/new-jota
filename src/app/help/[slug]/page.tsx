import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, Clock3, Lightbulb } from "lucide-react"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { getHelpGuide, helpGuides } from "@/features/help/help-guides"
import { getAuthenticatedAppUser } from "@/lib/supabase/profile"

export function generateStaticParams() {
  return helpGuides.map((guide) => ({ slug: guide.slug }))
}

export default async function HelpGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const guide = getHelpGuide(slug)
  if (!guide) notFound()

  if (guide.section === "Administrators") {
    const user = await getAuthenticatedAppUser()
    if (!user?.title?.toLocaleLowerCase().includes("admin")) notFound()
  }

  const relatedGuides = guide.related.map(getHelpGuide).filter((item): item is NonNullable<typeof item> => Boolean(item))

  return <DashboardShell>
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/help" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-3.5" /> All guides</Link>
      <header className="mt-4 rounded-2xl border border-primary/15 bg-card/75 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-semibold text-primary">{guide.section}</span><span className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-[10px] text-muted-foreground">{guide.audience}</span><span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="size-3" />{guide.minutes} min read</span></div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{guide.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{guide.summary}</p>
      </header>

      <section className="mt-5 space-y-3" aria-label={`${guide.title} steps`}>
        {guide.steps.map((step, index) => <article key={step.title} className="relative flex gap-3 rounded-xl border border-primary/12 bg-card/70 p-4 sm:gap-4 sm:p-5">
          <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-primary/20 bg-background text-xs font-bold text-primary">{index + 1}</span>
          <div className="min-w-0"><h2 className="text-sm font-semibold">{step.title}</h2><p className="mt-1.5 text-sm leading-6 text-muted-foreground">{step.body}</p></div>
        </article>)}
      </section>

      <aside className="mt-4 rounded-xl border border-accent/35 bg-accent/10 p-4" aria-label="Important note">
        <div className="flex gap-2.5"><Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-xs font-semibold">Remember</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{guide.remember}</p></div></div>
      </aside>

      {guide.actions.length > 0 && <section className="mt-5 rounded-xl border border-border bg-card/60 p-4" aria-labelledby="guide-actions-heading">
        <h2 id="guide-actions-heading" className="text-xs font-semibold">Go to this part of Jota</h2>
        <div className="mt-3 flex flex-wrap gap-2">{guide.actions.map((action, index) => <Link key={action.href} href={action.href} className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${index === 0 ? "border-primary bg-primary text-primary-foreground hover:bg-primary/85" : "border-border bg-background hover:bg-muted hover:text-foreground"}`}>{action.label}<ArrowRight className="size-3.5" /></Link>)}</div>
      </section>}

      {relatedGuides.length > 0 && <section className="mt-7" aria-labelledby="related-guides-heading">
        <h2 id="related-guides-heading" className="text-sm font-semibold">Related guides</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">{relatedGuides.map((item) => <Link key={item.slug} href={`/help/${item.slug}`} className="group flex items-center gap-3 rounded-lg border border-border bg-card/65 p-3 transition hover:border-primary/30 hover:bg-card"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Check className="size-3.5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{item.title}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{item.summary}</span></span><ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" /></Link>)}</div>
      </section>}

      <div className="mt-7 border-t border-border/80 pt-4"><Link href="/help" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"><ArrowLeft className="size-3.5" /> Back to Help center</Link></div>
    </main>
  </DashboardShell>
}
