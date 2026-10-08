import Link from "next/link"
import { redirect } from "next/navigation"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { getStorageActor } from "@/lib/storage/authorization"

export const dynamic = "force-dynamic"

export default async function AdminSystemPage() {
  const actor = await getStorageActor()
  if (!actor) redirect("/login")

  const { data: memberships, error: membershipsError } = await actor.supabase
    .from("user_roles")
    .select("role_id")
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId)

  if (membershipsError || !memberships?.length) redirect("/access-denied")

  const { data: roles, error: rolesError } = await actor.supabase
    .from("roles")
    .select("code")
    .eq("organization_id", actor.organizationId)
    .in("id", memberships.map(({ role_id }) => role_id))

  if (rolesError || !roles?.some(({ code }) => code === "administrator")) redirect("/access-denied")

  // A tiny user-scoped read confirms the authenticated app can reach its database.
  // It does not enumerate organization records or write anything.
  const { data: databaseCheck, error: databaseError } = await actor.supabase
    .from("profiles")
    .select("id")
    .eq("id", actor.userId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle()

  const databaseReady = !databaseError && Boolean(databaseCheck)

  return <DashboardShell>
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/" className="text-xs font-medium text-muted-foreground hover:text-foreground">← Back to workspace</Link>
      <header className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">Administration</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">System</h1>
        <p className="mt-1 text-sm text-muted-foreground">Read-only service and database checks. No schema or workspace data is changed here.</p>
      </header>

      <section aria-label="Current system checks" className="mt-6 grid gap-4 md:grid-cols-2">
        <article className="glass-panel rounded-2xl border p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Database connection</h2>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${databaseReady ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-red-500/10 text-red-800 dark:text-red-300"}`}>
              {databaseReady ? "Connected" : "Unavailable"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {databaseReady
              ? "Jota completed a read-only check using your signed-in account. This confirms reachability, not overall database health or write availability."
              : "The signed-in account could not complete a read-only profile check. No changes were attempted."}
          </p>
        </article>

        <article className="glass-panel rounded-2xl border p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Hosted migration status</h2>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-900 dark:text-amber-300">Not verified</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            The app does not read Supabase’s migration ledger, so local migration files cannot prove what is applied to the hosted project. Verify the hosted version and required objects in Supabase before any release or database change.
          </p>
        </article>
      </section>

      <section className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-5" aria-labelledby="safety-heading">
        <h2 id="safety-heading" className="text-sm font-semibold">Database safety</h2>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
          Database changes remain managed as reviewed SQL migrations in the repository and applied through the controlled release process. This page intentionally has no SQL editor, direct table editing, migration replay, backup restore, or delete controls.
        </p>
      </section>
    </main>
  </DashboardShell>
}
