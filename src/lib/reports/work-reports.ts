import "server-only"
import type { WorkspaceRequestContext } from "@/lib/supabase/request-context"
import { reportActivityPreviewSchema, validReportDate, type ReceivedReportSummary, type VersionSummary, type WorkReport, type ReportWorkspace, type ReportEntry } from "@/features/reports/report-model"

export class WorkReportError extends Error { constructor(message: string, public status = 503) { super(message) } }
export const reportColumns = "id,report_date,timezone,entries,recipient_id,revision,latest_version,draft_open,updated_at"
export const versionSummaryColumns = "id,report_id,author_id,author_name,job_title,report_date,timezone,version_number,recipient_id,submitted_at,checked_at,checked_by,is_latest"
export async function getReceivedReportPreviews(actor: WorkspaceRequestContext, versions: VersionSummary[]): Promise<ReceivedReportSummary[]> {
  if (!versions.length) return []
  // One bounded query for this inbox page. Full reports are fetched only on View.
  // Use the signed-in client so the version's existing recipient RLS still applies.
  const { data, error } = await actor.supabase.from("daily_work_report_versions")
    .select("id,first:entries->0,second:entries->1,more:entries->2->id")
    .eq("organization_id", actor.organizationId).in("id", versions.map(version => version.id))
  if (error) throw workReportError(error)
  const previews = new Map((data ?? []).map(row => [row.id, row]))
  return versions.map(version => {
    const row = previews.get(version.id)
    if (!row) throw new WorkReportError("Could not load report activities. Refresh to retry.")
    const parsed = reportActivityPreviewSchema.array().safeParse([row.first, row.second].filter(entry => entry != null))
    if (!parsed.success) throw new WorkReportError("Could not load report activities. Open the report again later.")
    return { ...version, activityPreview: parsed.data, hasMoreActivities: row.more != null }
  })
}
export async function getReportSourceLinks(actor: WorkspaceRequestContext, entries: ReportEntry[]) {
  const ids = [...new Set(entries.flatMap(entry => entry.sourceId ? [entry.sourceId] : []))]
  if (!ids.length) return {}
  // Existing activity RLS checks the viewer's current access to each entity.
  // A report grants no access to its source task, content or files.
  const { data, error } = await actor.supabase.from("activity_logs").select("id,entity_id,entity_type").eq("organization_id", actor.organizationId).in("id", ids)
  if (error) return {}
  return Object.fromEntries((data ?? []).flatMap(item => item.entity_type === "task" ? [[item.id, `/tasks/${item.entity_id}`]] : item.entity_type === "content_item" ? [[item.id, `/content#content-item-${item.entity_id}`]] : [])) as Record<string, string>
}
export function workReportError(error: { code?: string; message?: string }) {
  if (["42P01", "PGRST205", "PGRST202", "42703"].includes(error.code ?? "")) return new WorkReportError("Daily reports are not enabled yet. Ask your administrator to apply the daily work report migrations.")
  if (error.code === "40001") return new WorkReportError("This report changed in another window. Copy your work, then reload before continuing.", 409)
  if (error.code === "23514") return new WorkReportError("This report is submitted. Create a correction to edit it.", 409)
  if (error.code === "42501") return new WorkReportError("You cannot access this report or recipient. Choose an active supervisor in your workspace.", 403)
  if (error.code === "22023") return new WorkReportError("Check the activities, times, progress and date. Work times must not be in the future.", 400)
  return new WorkReportError("The report could not be saved. Keep this page open and retry.")
}
export async function getReportWorkspace(actor: WorkspaceRequestContext, requested?: string): Promise<ReportWorkspace> {
  const { data: calendar, error } = await actor.supabase.rpc("daily_work_report_calendar")
  if (error) throw workReportError(error)
  if (!calendar || typeof calendar.timezone !== "string" || typeof calendar.today !== "string" || !validReportDate(calendar.today)) throw new WorkReportError("Could not load the reporting calendar.")
  const timezone = calendar.timezone, today = calendar.today, date = requested || today
  if (!validReportDate(date)) throw new WorkReportError("Choose a valid reporting date.", 400)
  const [own, supervisors, recent] = await Promise.all([
    actor.supabase.from("daily_work_reports").select(reportColumns).eq("organization_id", actor.organizationId).eq("author_id", actor.userId).eq("report_date", date).maybeSingle(),
    actor.supabase.rpc("daily_work_report_supervisors"),
    actor.supabase.from("daily_work_reports").select("recipient_id").eq("organization_id", actor.organizationId).eq("author_id", actor.userId).not("recipient_id", "is", null).order("updated_at", { ascending: false }).limit(1),
  ])
  if (own.error || supervisors.error || recent.error) throw workReportError(own.error || supervisors.error || recent.error!)
  const report = own.data as WorkReport | null
  if (date > today && !report) throw new WorkReportError("Choose today or an earlier valid date.", 400)
  const versions = report ? await actor.supabase.from("daily_work_report_versions").select(versionSummaryColumns).eq("organization_id", actor.organizationId).eq("report_id", report.id).order("version_number", { ascending: false }).limit(30) : { data: [], error: null }
  if (versions.error) throw workReportError(versions.error)
  const choices = supervisors.data as { id: string; display_name: string }[]
  const previous = recent.data?.[0]?.recipient_id
  return { date, today, timezone: report?.timezone || timezone, calendarTimezone: timezone, report, supervisors: choices, lastRecipient: choices.some(p => p.id === previous) ? previous : null, versions: versions.data ?? [], sourceLinks: await getReportSourceLinks(actor, report?.entries ?? []) }
}
