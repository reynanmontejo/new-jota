import { redirect } from "next/navigation"
import Link from "next/link"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getEmployeeManagementAccess } from "@/lib/supabase/employee-admin"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { EmployeeRowActions } from "@/features/employees/employee-row-actions"
import { createEmployee, restoreEmployeeFromTrash, updateEmployee } from "./actions"
import { decidePasswordChangeRequest } from "@/app/profile/password-actions"

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
type PasswordRequestRow = {
  id: string
  user_id: string
  request_note: string | null
  requested_at: string
  employee: { display_name: string; email: string } | null
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
  approved: "Password change approved. The employee can now change it from their Profile page.",
  rejected: "Password change request declined.",
  stale: "That request has already been reviewed. Refresh the list.",
  decision_failed: "The request decision could not be saved. Refresh and try again.",
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
  const view = params.view === "trash" ? "trash" : params.view === "password-requests" ? "password-requests" : "roster"
  const access = await getEmployeeManagementAccess()
  const viewer = access.context
  if (!viewer || !access.permissions.includes("employees.view")) redirect("/access-denied")
  const creator = access.permissions.includes("employees.create")
  const editor = access.permissions.includes("employees.update")
  const deactivator = access.permissions.includes("employees.deactivate")
  const deletionManager = access.permissions.includes("employees.delete")
  if (view === "trash" && !deletionManager) redirect("/access-denied")
  let trashSchemaReady = true
  const isAdministrator = access.roleCodes.includes("administrator")
  if (view === "password-requests" && !isAdministrator) redirect("/access-denied")
  const employees: EmployeeRow[] = []
  let roster: EmployeeRow[] = []
  let trashed: EmployeeRow[] = []
  let visibleEmployees: EmployeeRow[] = []
  if (view !== "password-requests") {
    const supabase = await createClient()
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
    employees.push(...profileRows.map((employee) => ({ ...employee, role: roleByUser.get(employee.id) ?? null })))
    roster = employees.filter((employee) => employee.deletion_requested_at === null && employee.purged_at === null)
    trashed = employees.filter((employee) => employee.deletion_requested_at !== null && employee.purged_at === null)
    visibleEmployees = view === "trash" ? trashed : roster
  }
  const notice = typeof params.notice === "string" ? notices[params.notice] : undefined
  let passwordRequests: PasswordRequestRow[] = []
  let passwordRequestsReady = true
  if (isAdministrator && view === "password-requests") {
    try {
      const service = createServiceClient()
      const result = await service.from("password_change_requests").select("id,user_id,request_note,requested_at")
        .eq("organization_id", viewer.organizationId).eq("status", "pending").order("requested_at", { ascending: true })
      if (result.error) passwordRequestsReady = false
      else {
        const requests = result.data ?? []
        const employeeIds = [...new Set(requests.map(({ user_id }) => user_id))]
        const employeesResult = employeeIds.length
          ? await service.from("profiles").select("id,display_name,email")
              .eq("organization_id", viewer.organizationId).in("id", employeeIds)
          : { data: [], error: null }
        if (employeesResult.error) passwordRequestsReady = false
        else {
          const employeesById = new Map((employeesResult.data ?? []).map((employee) => [employee.id, employee]))
          passwordRequests = requests.map((request) => ({
            ...request,
            employee: employeesById.get(request.user_id) ?? null,
          }))
        }
      }
    } catch { passwordRequestsReady = false }
  }

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
          <Link href="/employees" aria-current={view === "roster" ? "page" : undefined} className={`border-b-2 px-3 py-2 text-xs font-medium ${view === "roster" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Roster {view !== "password-requests" && <span className="ml-1 text-[10px]">{roster.length}</span>}</Link>
          {deletionManager && <Link href="/employees?view=trash" aria-current={view === "trash" ? "page" : undefined} className={`border-b-2 px-3 py-2 text-xs font-medium ${view === "trash" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Trash {view !== "password-requests" && <span className="ml-1 text-[10px]">{trashed.length}</span>}</Link>}
          {isAdministrator && <Link href="/employees?view=password-requests" aria-current={view === "password-requests" ? "page" : undefined} className={`border-b-2 px-3 py-2 text-xs font-medium ${view === "password-requests" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Password requests</Link>}
        </div>

        {view === "password-requests" ? <section className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">Pending password requests</h2><p className="mt-0.5 text-[11px] text-muted-foreground">Approve or decline requests. Employees set their own password after approval; passwords are never shown here.</p></div>
          {!passwordRequestsReady ? <p className="p-5 text-xs text-amber-800 dark:text-amber-300">Password requests are unavailable until migration 202610230001_profile_photos_and_password_approval.sql is applied.</p>
            : passwordRequests.length === 0 ? <p className="p-5 text-xs text-muted-foreground">No password change requests are waiting.</p>
              : <div className="divide-y">{passwordRequests.map((request) => {
                const employee = request.employee
                return <article key={request.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(180px,1fr)_minmax(220px,2fr)_auto] sm:items-center">
                  <div className="min-w-0"><p className="truncate text-xs font-semibold">{employee?.display_name ?? "Employee"}</p><p className="truncate text-[11px] text-muted-foreground">{employee?.email ?? "Account"} · {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.requested_at))}</p></div>
                  <p className="text-xs text-muted-foreground">{request.request_note || "No reason provided."}</p>
                  <form action={decidePasswordChangeRequest} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="requestId" value={request.id} />
                    <input className={inputClass + " sm:w-44"} name="decisionNote" maxLength={500} placeholder="Note (optional)" aria-label="Optional decision note" />
                    <Button type="submit" size="sm" name="decision" value="approved">Approve</Button>
                    <Button type="submit" size="sm" variant="outline" name="decision" value="rejected">Decline</Button>
                  </form>
                </article>
              })}</div>}
        </section> : view === "roster" && creator && (
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

        {view !== "password-requests" && <section className="mt-5 overflow-visible rounded-lg border bg-card">
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
                      <form id={`employee-update-${employee.id}`} action={updateEmployee} className="grid gap-2 sm:grid-cols-[1fr_1fr_150px]">
                        <input type="hidden" name="employeeId" value={employee.id} />
                        <input type="hidden" name="status" value={employee.status === "inactive" ? "inactive" : "active"} />
                        <label className="sr-only" htmlFor={"name-" + employee.id}>Name</label>
                        <input className={inputClass} id={"name-" + employee.id} name="displayName" aria-label={"Name for " + employee.display_name} defaultValue={employee.display_name} required minLength={2} maxLength={120} />
                        <input className={inputClass} name="jobTitle" aria-label={"Job title for " + employee.display_name} defaultValue={employee.job_title ?? ""} placeholder="Job title" maxLength={120} />
                        <select className={inputClass} name="roleCode" aria-label={"Role for " + employee.display_name} defaultValue={role.code}>
                          <option value="account_manager">Employee</option><option value="supervisor">Supervisor</option>
                        </select>
                      </form>
                    ) : (
                      <div className="text-xs text-muted-foreground">{role.name}{protectedAdmin ? " � protected admin" : ""}</div>
                    )}
                    <div className="flex items-center justify-between gap-3 lg:justify-end">
                      <Badge variant={employee.status === "active" ? "secondary" : "outline"}>{employee.status === "inactive" ? "Deactivated" : employee.status === "invited" ? "Invited" : "Active"}</Badge>
                      <EmployeeRowActions
                        employeeId={employee.id}
                        employeeName={employee.display_name}
                        employeeEmail={employee.email}
                        status={employee.status}
                        updateFormId={`employee-update-${employee.id}`}
                        canEdit={editor && !protectedAdmin}
                        canChangeStatus={deactivator && !protectedAdmin && employee.id !== viewer.actorId}
                        canDelete={deletionManager && !protectedAdmin && employee.id !== viewer.actorId}
                      />
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>}
      </main>
    </DashboardShell>
  )
}
