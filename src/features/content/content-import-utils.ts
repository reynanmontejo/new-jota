export type ImportField =
  | "client"
  | "campaign"
  | "title"
  | "platform"
  | "contentType"
  | "status"
  | "workDate"
  | "deadlineAt"
  | "publishAt"
  | "clientApprovalStatus"
  | "clientIssues"
  | "revisionCount"
  | "notes"
  | "description"
  | "nextAction"
  | "revisionNotes"
  | "assignee"

export const contentImportFields: Array<{ id: ImportField; label: string; required?: boolean; aliases: string[] }> = [
  { id: "client", label: "Client / account", required: true, aliases: ["client", "client name", "account", "account name", "brand"] },
  { id: "campaign", label: "Campaign", required: true, aliases: ["campaign", "campaign name", "project", "content campaign"] },
  { id: "title", label: "Content title", required: true, aliases: ["title", "post title", "content title", "post idea", "content idea", "topic", "post name", "content name"] },
  { id: "platform", label: "Platform", required: true, aliases: ["platform", "social platform", "channel", "social media"] },
  { id: "contentType", label: "Format", required: true, aliases: ["format", "content type", "post type", "content format", "type"] },
  { id: "status", label: "Status", aliases: ["status", "content status", "production status"] },
  { id: "workDate", label: "Work date", aliases: ["date", "work date", "start date", "production date"] },
  { id: "deadlineAt", label: "Deadline", aliases: ["deadline", "due date", "deadline date"] },
  // Keep publish date separate from generic DATE, DEADLINE and WEEK columns.
  { id: "publishAt", label: "Publish date", aliases: ["publish date", "publish at", "scheduled date", "posting date"] },
  { id: "clientApprovalStatus", label: "Client approval", aliases: ["client approval", "approval status", "client approval status"] },
  { id: "clientIssues", label: "Client issues", aliases: ["client issues", "issue", "issues"] },
  { id: "revisionCount", label: "Revision count", aliases: ["no. of revision", "no. of revisions", "revision count", "revisions"] },
  { id: "notes", label: "Notes / comments", aliases: ["notes/comments", "notes and comments", "comments/notes", "notes"] },
  { id: "description", label: "Brief / caption", aliases: ["description", "caption", "brief"] },
  { id: "nextAction", label: "Next action", aliases: ["next action", "action", "next step"] },
  { id: "revisionNotes", label: "Revision feedback", aliases: ["revision notes", "revision comments", "client comments", "feedback", "comments"] },
  { id: "assignee", label: "Assigned creator", aliases: ["designer", "creator", "assignee", "assigned to", "owner", "responsible", "editor", "video/graphic editor", "video/grahpic editor"] },
]

export const normalizeImportValue = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ")

export function detectContentImportMapping(headers: string[]) {
  const mapping: Partial<Record<ImportField, string>> = {}
  for (const field of contentImportFields) {
    const found = headers.findIndex((header) => field.aliases.includes(normalizeImportValue(header)))
    if (found >= 0) mapping[field.id] = String(found)
  }
  return mapping
}

/** A compact path for Jota's date/focus/idea/format social calendar exports. */
export function detectSocialCalendarMapping(headers: string[]): Partial<Record<ImportField, string>> | null {
  const findColumn = (names: string[]) => headers.findIndex((header) => names.includes(normalizeImportValue(header)))
  const date = findColumn(["date", "publish date", "posting date"])
  const focus = findColumn(["type/focus", "focus", "content pillar"])
  const title = findColumn(["content idea", "post idea", "content title"])
  const format = findColumn(["format", "content format", "post format"])
  if ([date, focus, title, format].some((index) => index < 0)) return null

  const status = findColumn(["status", "progress", "progress status"])
  return {
    title: String(title),
    contentType: String(format),
    publishAt: String(date),
    description: String(focus),
    ...(status >= 0 ? { notes: String(status) } : {}),
  }
}

export type ContentImportStatus = "idea" | "planned" | "in_production" | "for_review" | "revision_requested" | "waiting_client" | "scheduled" | "published" | "rejected" | "cancelled"

export function readContentImportStatus(value: string): ContentImportStatus | null {
  const status = normalizeImportValue(value).replace(/[ _-]+/g, " ")
  if (["production", "in production", "in progress", "in design", "in writing", "working"].includes(status)) return "in_production"
  if (["scheduled", "in calendar", "ready to publish"].includes(status)) return "scheduled"
  if (["qc approval", "for review", "in review", "quality check", "quality control"].includes(status)) return "for_review"
  if (["for revision", "revision requested", "revisions requested", "needs revision"].includes(status)) return "revision_requested"
  if (["waiting client", "waiting on client", "client review", "awaiting client"].includes(status)) return "waiting_client"
  if (["rejected", "declined"].includes(status)) return "rejected"
  if (["published", "posted", "completed", "complete", "done"].includes(status)) return "published"
  if (["cancelled", "canceled", "cancelled post"].includes(status)) return "cancelled"
  if (["idea", "draft", "backlog"].includes(status)) return "idea"
  if (["planned", "not started", "to do", "todo", "pending"].includes(status)) return "planned"
  return null
}

export function parseContentImportDate(value: string) {
  // Week labels are reporting buckets, not exact post dates. Do not turn a
  // date range into its first day even if a user explicitly selects WEEK.
  if (/(?:\b[A-Za-z]{3,9}\s+\d{1,2}|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s*(?:–|—|\bto\b)\s*(?:[A-Za-z]{3,9}\s+)?\d{1,2}\b/i.test(value)) return null
  const dateOnly = value.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    const localDate = new Date(Number(year), Number(month) - 1, Number(day), 12)
    return localDate.getFullYear() === Number(year) && localDate.getMonth() === Number(month) - 1 && localDate.getDate() === Number(day)
      ? localDate
      : null
  }
  const direct = new Date(value)
  if (!Number.isNaN(direct.getTime())) return direct
  const year = value.match(/\b(20\d{2})\b/)?.[1]
  const firstDate = value.match(/[A-Za-z]{3,9}\s+\d{1,2}|(?:\d{1,2}[/-]){1,2}\d{2,4}/)?.[0]
  if (!year || !firstDate) return null
  const rangedDate = new Date(`${firstDate}, ${year}`)
  if (Number.isNaN(rangedDate.getTime())) return null
  rangedDate.setHours(12, 0, 0, 0)
  return rangedDate
}

export function readClientApprovalStatus(value: string): "pending" | "approved" | "revision_requested" | "rejected" | null {
  const status = normalizeImportValue(value).replace(/[ _-]+/g, " ")
  if (!status || ["none", "n/a", "na", "not applicable"].includes(status)) return null
  if (["approved", "approve", "yes", "complete"].includes(status)) return "approved"
  if (["pending", "awaiting", "waiting", "waiting client", "client review"].includes(status)) return "pending"
  if (["revision requested", "for revision", "needs revision", "revise"].includes(status)) return "revision_requested"
  if (["rejected", "declined", "not approved"].includes(status)) return "rejected"
  return null
}

export function parseContentImportCount(value: string) {
  if (!value.trim()) return 0
  if (!/^\d+$/.test(value.trim())) return null
  const count = Number(value.trim())
  return Number.isSafeInteger(count) && count <= 10000 ? count : null
}

export function parseContentImportDateOnly(value: string) {
  const date = parseContentImportDate(value)
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : null
}
