import "server-only"
import type { WorkspaceRequestContext } from "@/lib/supabase/request-context"
import { composeDailyReport } from "@/features/assistant/assistant-help"

export type DailyReport = { id: string; author_id: string; report_date: string; body: string; status: "draft" | "submitted"; recipient_id: string | null; submitted_at: string | null; revision: number; notes_revision: number; body_notes_revision: number | null }
export type ReportNote = { id: string; body: string; created_at: string }
export type ReportWorkspace = { date: string; today: string; timezone: string; report: DailyReport | null; notes: ReportNote[]; supervisors: { id: string; display_name: string }[]; inbox: (DailyReport & { authorName: string })[]; canReceive: boolean }
export class ReportError extends Error { constructor(message: string, public status = 503) { super(message) } }
const reportColumns = "id,author_id,report_date,body,status,recipient_id,submitted_at,revision,notes_revision,body_notes_revision"

export function reportMutationError(error: { code?: string }) {
  if (["PGRST202", "PGRST205", "42P01"].includes(error.code ?? "")) return new ReportError("Daily reports are not available yet. Ask an administrator to finish setup.")
  if (error.code === "40001") return new ReportError("This report changed in another window. Reload it before saving or sending.", 409)
  if (error.code === "23514") return new ReportError("This report was already sent and is locked.", 409)
  if (error.code === "42501") return new ReportError("You do not have access to that report or supervisor.", 403)
  if (error.code === "22023") return new ReportError("Check the date, report text and supervisor. Save an up-to-date draft before sending.", 400)
  return new ReportError("The report could not be saved. Your text is still available here; please retry.")
}

export async function readReportWorkspace(actor: WorkspaceRequestContext, requestedDate?: string): Promise<ReportWorkspace> {
  const { data: organization, error: organizationError } = await actor.supabase.from("organizations").select("timezone").eq("id", actor.organizationId).maybeSingle()
  if (organizationError || !organization) throw new ReportError("The reporting calendar could not be loaded.")
  let timezone = organization.timezone || "Asia/Manila"
  try { Intl.DateTimeFormat("en", { timeZone: timezone }) } catch { timezone = "Asia/Manila" }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
  const date = requestedDate || today
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || date > today) throw new ReportError("Choose today or an earlier valid date.", 400)
  const canReceive = actor.roles.some(({ code }) => code === "supervisor" || code === "administrator")
  const [own, candidates, received] = await Promise.all([
    actor.supabase.from("daily_reports").select(reportColumns).eq("organization_id", actor.organizationId).eq("author_id", actor.userId).eq("report_date", date).maybeSingle(),
    actor.supabase.rpc("list_daily_report_supervisors"),
    canReceive ? actor.supabase.from("daily_reports").select(reportColumns).eq("organization_id", actor.organizationId).eq("recipient_id", actor.userId).eq("status", "submitted").order("submitted_at", { ascending: false }).limit(30) : Promise.resolve({ data: [], error: null }),
  ])
  if (own.error || candidates.error || received.error) throw reportMutationError(own.error || candidates.error || received.error!)
  const report = own.data as DailyReport | null
  const inbox = (received.data ?? []) as DailyReport[]
  const authorIds = [...new Set(inbox.map((item) => item.author_id))]
  const [notesResult, authorsResult] = await Promise.all([
    report ? actor.supabase.from("daily_report_notes").select("id,body,created_at").eq("organization_id", actor.organizationId).eq("report_id", report.id).order("created_at").order("id") : Promise.resolve({ data: [], error: null }),
    authorIds.length ? actor.supabase.from("profiles").select("id,display_name").eq("organization_id", actor.organizationId).in("id", authorIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (notesResult.error || authorsResult.error) throw new ReportError("Report updates could not be loaded. Please retry.")
  const names = new Map((authorsResult.data ?? []).map(({ id, display_name }) => [id, display_name]))
  return { date, today, timezone, report, notes: notesResult.data ?? [], supervisors: candidates.data ?? [], inbox: inbox.map((item) => ({ ...item, authorName: names.get(item.author_id) ?? "Employee" })), canReceive }
}

export async function generateReport(actor: WorkspaceRequestContext, date?: string, replace = false, expectedRevision?: number) {
  const workspace = await readReportWorkspace(actor, date)
  if (workspace.report?.status === "submitted") throw new ReportError("This report was already sent and is locked.", 409)
  if (!workspace.notes.length) throw new ReportError("Save at least one update first, or write your report in the Report tab.", 400)
  if (workspace.report?.body && !replace) throw new ReportError("A draft is already saved. Open Report to edit it. Use Generate from notes there if you want to replace it.", 409)
  if (replace && expectedRevision !== workspace.report?.revision) throw new ReportError("Reload the report before replacing its draft.", 409)
  const body = composeDailyReport(actor.displayName, workspace.date, workspace.notes)
  if (body.length > 20000) throw new ReportError("These updates are too long for a single report. Write a shorter summary in Report.", 400)
  const { error } = await actor.supabase.rpc("save_daily_report_body", { p_date: workspace.date, p_body: body, p_expected_revision: workspace.report?.revision ?? 0 })
  if (error) throw reportMutationError(error)
  return body
}
