import { z } from "zod"

const clock = z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)])
export const reportEntrySchema = z.object({
  id: z.uuid(), activity: z.string().max(500), start: clock, end: clock,
  progress: z.number().int().min(0).max(100).nullable(), remarks: z.string().max(1000),
  nextDay: z.boolean(), sourceId: z.uuid().nullable().optional(),
})
export type ReportEntry = z.infer<typeof reportEntrySchema>
export type WorkReport = { id: string; report_date: string; timezone: string; entries: ReportEntry[]; recipient_id: string | null; revision: number; latest_version: number; draft_open: boolean; updated_at: string }
export type ReportVersion = { id: string; report_id: string; author_id: string; author_name: string; job_title: string | null; report_date: string; timezone: string; version_number: number; entries: ReportEntry[]; recipient_id: string; submitted_at: string; checked_at: string | null; checked_by: string | null; is_latest: boolean; sourceLinks?: Record<string, string> }
export type VersionSummary = Omit<ReportVersion, "entries">
export const reportActivityPreviewSchema = reportEntrySchema.pick({ id: true, activity: true, start: true, end: true, progress: true, nextDay: true })
export type ReportActivityPreview = z.infer<typeof reportActivityPreviewSchema>
export type ReceivedReportSummary = VersionSummary & { activityPreview: ReportActivityPreview[]; hasMoreActivities: boolean }
export type ReportWorkspace = { date: string; today: string; timezone: string; calendarTimezone?: string; report: WorkReport | null; supervisors: { id: string; display_name: string }[]; lastRecipient: string | null; versions: VersionSummary[]; sourceLinks?: Record<string, string> }
export type ActivitySuggestion = { id: string; entity_id: string; entity_type: string; action: string; title: string; occurred_at: string }
export function newReportEntry(): ReportEntry { return { id: crypto.randomUUID(), activity: "", start: "", end: "", progress: null, remarks: "", nextDay: false, sourceId: null } }
export function reportDate(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type)?.value).join("-")
}
export function validReportDate(date: string) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date }
export function entryErrors(entries: ReportEntry[]) {
  if (!entries.length) return ["Add at least one activity."]
  return entries.flatMap((entry, index) => {
    const errors: string[] = []; const row = `Row ${index + 1}`
    if (!entry.activity.trim()) errors.push(`${row}: enter an activity.`)
    if (!entry.start || !entry.end) errors.push(`${row}: enter both times.`)
    else { const duration = minutes(entry.end) + (entry.nextDay ? 1440 : 0) - minutes(entry.start); if (duration <= 0 || duration > 1440) errors.push(`${row}: check the time range.`) }
    if (entry.progress === null) errors.push(`${row}: enter progress.`)
    return errors
  })
}
function minutes(clock: string) { const [h, m] = clock.split(":").map(Number); return h * 60 + m }
export function overlappingEntries(entries: ReportEntry[]) {
  return entries.flatMap((entry, i) => entries.slice(i + 1).flatMap((other, j) => {
    if (!entry.start || !entry.end || !other.start || !other.end) return []
    const a = minutes(entry.start), b = minutes(entry.end) + (entry.nextDay ? 1440 : 0)
    const c = minutes(other.start), d = minutes(other.end) + (other.nextDay ? 1440 : 0)
    return b > a && d > c && a < d && c < b ? [`Rows ${i + 1} and ${i + j + 2} overlap.`] : []
  }))
}
export function suggestionText(item: ActivitySuggestion) {
  const labels: Record<string, string> = { TASK_SUBMITTED_FOR_REVIEW: "Submitted for review", TASK_REVIEW_APPROVED: "Reviewed and approved", TASK_CHANGES_REQUESTED: "Reviewed and requested revisions", TASK_STATUS_CHANGED: "Started work", CONTENT_SUBMITTED_FOR_REVIEW: "Submitted content for review", CONTENT_REVIEW_APPROVED: "Reviewed and approved content", CONTENT_CHANGES_REQUESTED: "Reviewed content and requested revisions", CONTENT_SENT_TO_CLIENT: "Sent content to client", CONTENT_EXTERNAL_CLIENT_DECISION_RECORDED: "Recorded client decision", CONTENT_CLIENT_APPROVAL_RECORDED: "Recorded client decision", CONTENT_POSTING_SCHEDULED: "Set posting schedule" }
  return `${labels[item.action] || "Worked on"}: ${item.title}`.slice(0, 500)
}
export function reportVersionStatus(version: Pick<ReportVersion, "is_latest" | "checked_at">) {
  if (!version.is_latest) return version.checked_at ? "Checked · Earlier version" : "Earlier version"
  return version.checked_at ? "Checked" : "Submitted"
}
export function reportText(name: string, date: string, zone: string, entries: ReportEntry[]) {
  return [`Daily report · ${date}`, name, zone, "", ...entries.map(e => `${e.start || "—"} – ${e.end || "—"}${e.nextDay ? " (+1 day)" : ""} | ${e.activity} | ${e.progress ?? "—"}%${e.remarks ? ` | ${e.remarks}` : ""}`)].join("\n")
}
