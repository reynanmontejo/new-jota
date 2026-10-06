import { redirect } from "next/navigation"
import Link from "next/link"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getEmployeeManagementContext } from "@/lib/supabase/employee-admin"
import { createClient } from "@/lib/supabase/server"
import { createEmployee, moveEmployeeToTrash, restoreEmployeeFromTrash, setEmployeeActiveState, updateEmployee } from "./actions"

type EmployeeRow = {
  id: string
  email: string
  display_name: string
  job_title: string | null
  status: "invited" | "active" | "inactive"
  created_at: string
  deletion_requested_at: string | null
  purge_after_at: string | null
  purged_at: string | null
  role: { code: string; name: string } | null
}

const notices: Record<string, string> = {
  created: "Employee account created. Share the temporary sign-in credentials with them securely.",
  updated: "Employee details updated.",
  deactivated: "Employee deactivated; their records remain available.",
  reactivated: "Employee reactivated.",
  invalid: "Check the form fields and try again.",
  setup: "Account creation needs the server-side Supabase service role key configured.",
  create_failed: "The account could not be created. The email may already be in use or the server configuration needs attention.",
  update_failed: "The employee could not be updated. Refresh the page and try again.",
  protected: "Administrator accounts are protected from this screen.",
  trashed: "Account moved to Trash. Sign-in is blocked; it can be restored within 30 days.",
  restored: "Account restored. The employee can sign in again.",
  confirmation: "The confirmation email did not match the employee account.",
  delete_failed: "The account could not be moved to Trash. Refresh and try again.",
  restore_failed: "The account could not be restored. It may have passed the 30-day period.",
  trash_setup: "The employee roster loaded, but Trash is unavailable until the account-trash database migration is applied.",
}

function isMissingTrashColumns(error: { code?: string; message?: string }) {
  const mentionsTrashColumn = /deletion_requested_at|purge_after_at|purged_at/i.test(error.message ?? "")
  return mentionsTrashColumn && (error.code === "PGRST204" || error.code === "42703" || error.code === "PGRST200")
}

function isRestorePeriodExpired(purgeAfterAt: string | null) {
  // This is rendered by a dynamic server component, so compare against request
  // time to avoid offering a restore action after the database cutoff.
  return purgeAfterAt !== null && Date.parse(purgeAfterAt) <= Date.now()
}

function employeeRole(employee: EmployeeRow) {
  return employee.role ?? { code: "account_manager", name: "Employee" }
}

const inputClass = "h-9 min-w-0 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ notice?: string | string[]; view?: string }> }) {
  const params = await searchParams
  const view = params.view === "trash" ? "trash" : "roster"
  const viewer = await getEmployeeManagementContext("employees.view")
  if (!viewer) redirect("/access-denied")
  const [creator, editor, deactivator, deletionManager] = await Promise.all([
    getEmployeeManagementContext("employees.create"),
    getEmployeeManagementContext("employees.update"),
    getEmployeeManagementContext("employees.deactivate"),
    getEmployeeManagementContext("employees.delete"),
  ])
  if (view === "trash" && !deletionManager) redirect("/access-denied")
  const supabase = await createClient()
  let trashSchemaReady = true
  let { data, error } = await supabase.from("profiles")
    .select("id, email, display_name, job_title, status, created_at, deletion_requested_at, purge_after_at, purged_at")
    .eq("organization_id", viewer.organizationId).order("display_name")
  if (error && isMissingTrashColumns(error)) {
    // Keep the core roster usable when application code is deployed before
    // the optional account-trash migration. Other query failures stay visible.
    trashSchemaReady = false
    const legacyResult = await supabase.from("profiles")
      .select("id, email, display_name, job_title, status, created_at")
      .eq("organization_id", viewer.organizationId).order("display_name")
    data = legacyResult.data?.map((employee) => ({
      ...employee,
      deletion_requested_at: null,
      purge_after_at: null,
      purged_at: null,
    })) ?? null
    error = legacyResult.error
  }
  if (error) {
    console.error("Employee roster query failed", { code: error.code, message: error.message })
    throw new Error("Employee list could not be loaded. Check database migrations and employee-view access.")
  }
  if (view === "trash" && !trashSchemaReady) redirect("/employees?notice=trash_setup")
  const profileRows = (data ?? []) as Omit<EmployeeRow, "role">[]
  const employeeIds = profileRows.map(({ id }) => id)
  const { data: memberships, error: membershipsError } = employeeIds.length
    ? await supabase.from("user_roles").select("user_id, role_id")
        .eq("organization_id", viewer.organizationId).in("user_id", employeeIds)
    : { data: [], error: null }
  if (membershipsError) throw new Error("Employee roles could not be loaded.")
  const roleIds = [...new Set((memberships ?? []).map(({ role_id }) => role_id))]
  const { data: roles, error: rolesError } = roleIds.length
    ? await supabase.from("roles").select("id, code, name")
        .eq("organization_id", viewer.organizationId).in("id", roleIds)
    : { data: [], error: null }
  if (rolesError) throw new Error("Employee roles could not be loaded.")
  const roleById = new Map((roles ?? []).map(({ id, code, name }) => [id, { code, name }]))
  const roleByUser = new Map<string, { code: string; name: string }>()
  for (const membership of memberships ?? []) {
    const role = roleById.get(membership.role_id)
    const existing = roleByUser.get(membership.user_id)
    // Prefer the protected role when an account has multiple memberships.
    if (role && (!existing || role.code === "administrator")) roleByUser.set(membership.user_id, role)
  }
  const employees: EmployeeRow[] = profileRows.map((employee) => ({
    ...employee,
    role: roleByUser.get(employee.id) ?? null,
  }))
  const roster = employees.filter((employee) => employee.deletion_requested_at === null && employee.purged_at === null)
  const trashed = employees.filter((employee) => employee.deletion_requested_at !== null && employee.purged_at === null)
  const visibleEmployees = view === "trash" ? trashed : roster
  const notice = typeof params.notice === "string" ? notices[params.notice] : undefined

  return (
    <DashboardShell>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Workspace / Administration</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">Employees</h1>
            <p className="mt-1 text-xs text-muted-foreground">Manage organization access and employee roles.</p>
          </div>
          {view === "roster" && <Badge variant="outline" className="text-xs">{roster.filter((employee) => employee.status === "active").length} active</Badge>}
        </div>

        {notice && <p className="mb-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground" role="status">{notice}</p>}
        {!trashSchemaReady && <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-foreground" role="status">Trash and account deletion are unavailable until the account-trash database migration is applied. The employee roster is still available.</p>}

        <div className="mb-4 flex gap-1 border-b border-border/80">
          <Link href="/employees" aria-current={view === "roster" ? "page" : undefined} className={`border-b-2 px-3 py-2 text-xs font-medium ${view === "roster" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Roster <span className="ml-1 text-[10px]">{roster.length}</span></Link>
          {deletionManager && <Link href="/employees?view=trash" aria-current={view === "trash" ? "page" : undefined} className={`border-b-2 px-3 py-2 text-xs font-medium ${view === "trash" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Trash <span className="ml-1 text-[10px]">{trashed.length}</span></Link>}
        </div>

        {view === "roster" && creator && (
          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Create employee account</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">The employee can sign in immediately. Share their initial password privately; it is never shown again.</p>
            <form action={createEmployee} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="grid gap-1 text-[11px] font-medium">Full name
                <input className={inputClass} name="displayName" autoComplete="name" required minLength={2} maxLength={120} />
              </label>
              <label className="grid gap-1 text-[11px] font-medium">Work email
                <input className={inputClass} name="email" type="email" autoComplete="email" required />
              </label>
              <label className="grid gap-1 text-[11px] font-medium">Job title
                <input className={inputClass} name="jobTitle" maxLength={120} placeholder="e.g. Designer" />
              </label>
              <label className="grid gap-1 text-[11px] font-medium">Access level
                <select className={inputClass} name="roleCode" defaultValue="account_manager">
                  <option value="account_manager">Employee</option>
                  <option value="supervisor">Supervisor</option>
                </select>
              </label>
              <label className="grid gap-1 text-[11px] font-medium">Initial password
                <input className={inputClass} name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
              </label>
              <div className="sm:col-span-2 lg:col-span-5">
                <Button type="submit" size="sm">Create account</Button>
                <span className="ml-2 text-[10px] text-muted-foreground">At least 8 characters; share out of band.</span>
              </div>
            </form>
          </section>
        )}

        <section className="mt-5 overflow-visible rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div><h2 className="text-sm font-semibold">{view === "trash" ? "Trash" : "Organization roster"}</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{visibleEmployees.length} {view === "trash" ? "deleted accounts" : "accounts"}{view === "trash" && " · Accounts are permanently removed after 30 days"}</p></div>
          </div>
          {visibleEmployees.length === 0 ? <p className="p-5 text-xs text-muted-foreground">{view === "trash" ? "Trash is empty." : "No employee accounts found."}</p> : (
            <div className="divide-y">
              {visibleEmployees.map((employee) => {
                const role = employeeRole(employee)
                const protectedAdmin = role.code === "administrator"
                if (view === "trash") return (
                  <article key={employee.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0"><p className="truncate text-xs font-semibold">{employee.display_name}</p><p className="truncate text-[11px] text-muted-foreground">{employee.email} · {role.name}</p><p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">Scheduled for permanent removal {employee.purge_after_at ? new Date(employee.purge_after_at).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" }) : "after 30 days"}</p></div>
                    {isRestorePeriodExpired(employee.purge_after_at)
                      ? <span className="text-xs text-muted-foreground">Restore period expired · purge pending</span>
                      : <form action={restoreEmployeeFromTrash}><input type="hidden" name="employeeId" value={employee.id} /><Button type="submit" size="sm" variant="outline">Restore account</Button></form>}
                  </article>
                )
                return (
                  <article key={employee.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(180px,1fr)_minmax(380px,2fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{employee.display_name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{employee.email}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{employee.job_title || role.name}</p>
                    </div>
                    {editor && !protectedAdmin ? (
                      <form action={updateEmployee} className="grid gap-2 sm:grid-cols-[1fr_1fr_150px_auto]">
                        <input type="hidden" name="employeeId" value={employee.id} />
                        <input type="hidden" name="status" value={employee.status === "inactive" ? "inactive" : "active"} />
                        <label className="sr-only" htmlFor={"name-" + employee.id}>Name</label>
                        <input className={inputClass} id={"name-" + employee.id} name="displayName" aria-label={"Name for " + employee.display_name} defaultValue={employee.display_name} required minLength={2} maxLength={120} />
                        <input className={inputClass} name="jobTitle" aria-label={"Job title for " + employee.display_name} defaultValue={employee.job_title ?? ""} placeholder="Job title" maxLength={120} />
                        <select className={inputClass} name="roleCode" aria-label={"Role for " + employee.display_name} defaultValue={role.code}>
                          <option value="account_manager">Employee</option><option value="supervisor">Supervisor</option>
                        </select>
                        <Button type="submit" size="sm" variant="outline">Save</Button>
                      </form>
                    ) : (
                      <div className="text-xs text-muted-foreground">{role.name}{protectedAdmin ? " � protected admin" : ""}</div>
                    )}
                    <div className="flex items-center justify-between gap-3 lg:justify-end">
                      <Badge variant={employee.status === "active" ? "secondary" : "outline"}>{employee.status === "inactive" ? "Deactivated" : employee.status === "invited" ? "Invited" : "Active"}</Badge>
                      {deactivator && !protectedAdmin && employee.id !== viewer.actorId && employee.status !== "invited" && (
                        <form action={setEmployeeActiveState}>
                          <input type="hidden" name="employeeId" value={employee.id} />
                          <input type="hidden" name="status" value={employee.status === "active" ? "inactive" : "active"} />
                          <Button type="submit" size="sm" variant="ghost">{employee.status === "active" ? "Deactivate" : "Reactivate"}</Button>
                        </form>
                      )}
                      {deletionManager && !protectedAdmin && employee.id !== viewer.actorId && <details className="relative z-20">
                        <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/5 [&::-webkit-details-marker]:hidden">Delete account</summary>
                        <form action={moveEmployeeToTrash} className="absolute bottom-full right-0 z-30 mb-2 grid w-64 max-w-[calc(100vw-2rem)] gap-2 rounded-md border border-border bg-card p-3 text-left shadow-lg">
                          <input type="hidden" name="employeeId" value={employee.id} />
                          <p className="text-[11px] leading-4 text-muted-foreground">This immediately blocks app access and schedules permanent removal in 30 days. Enter their email to confirm.</p>
                          <input className={inputClass} name="confirmationEmail" type="email" required autoComplete="off" placeholder={employee.email} aria-label={`Confirm deletion of ${employee.display_name} by email`} />
                          <Button type="submit" size="sm" variant="destructive">Move to trash</Button>
                        </form>
                      </details>}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </DashboardShell>
  )
}
