import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getWorkspaceRequestContext } from "@/lib/supabase/request-context"
import { getReceivedReportPreviews, getReportSourceLinks, getReportWorkspace, versionSummaryColumns, WorkReportError, workReportError } from "@/lib/reports/work-reports"
import { reportEntrySchema, validReportDate } from "@/features/reports/report-model"

const headers = { "cache-control": "private, no-store" }
const mutations = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), date: z.iso.date(), entries: z.array(reportEntrySchema).max(100), recipient: z.uuid().nullable(), revision: z.number().int().nonnegative(), requestId: z.uuid() }),
  z.object({ action: z.literal("submit"), reportId: z.uuid(), revision: z.number().int().nonnegative(), requestId: z.uuid() }),
  z.object({ action: z.literal("correct"), reportId: z.uuid(), revision: z.number().int().nonnegative() }),
  z.object({ action: z.literal("check"), versionId: z.uuid() }),
])
function fail(error: unknown) { return NextResponse.json({ error: error instanceof WorkReportError ? error.message : "Daily reports are temporarily unavailable." }, { status: error instanceof WorkReportError ? error.status : 503, headers }) }
export async function GET(request: NextRequest) {
  const actor = await getWorkspaceRequestContext()
  if (!actor) return NextResponse.json({ error: "Sign in with an active account." }, { status: 401, headers })
  try {
    const q = request.nextUrl.searchParams, kind = q.get("kind") || "own"
    const date = q.get("date") || undefined
    if (date && !validReportDate(date)) throw new WorkReportError("Invalid date.", 400)
    if (kind === "own") return NextResponse.json(await getReportWorkspace(actor, date), { headers })
    if (kind === "suggestions") {
      if (!date) throw new WorkReportError("Choose a date.", 400)
      const { data, error } = await actor.supabase.rpc("daily_work_report_suggestions", { p_date: date })
      if (error) throw workReportError(error)
      return NextResponse.json({ items: data }, { headers })
    }
    if (kind === "version") {
      const parsed = z.uuid().safeParse(q.get("id"))
      if (!parsed.success) throw new WorkReportError("Invalid report.", 400)
      const { data, error } = await actor.supabase.from("daily_work_report_versions").select(`${versionSummaryColumns},entries`).eq("organization_id", actor.organizationId).eq("id", parsed.data).maybeSingle()
      if (error) throw workReportError(error)
      if (!data) throw new WorkReportError("Report not found or access was removed.", 404)
      return NextResponse.json({ ...data, sourceLinks: await getReportSourceLinks(actor, data.entries) }, { headers })
    }
    if (kind === "versions") {
      const id = z.uuid().safeParse(q.get("id")), before = z.coerce.number().int().positive().safeParse(q.get("before"))
      if (!id.success || !before.success) throw new WorkReportError("Invalid version history.", 400)
      const { data, error } = await actor.supabase.from("daily_work_report_versions").select(versionSummaryColumns).eq("organization_id", actor.organizationId).eq("report_id", id.data).lt("version_number", before.data).order("version_number", { ascending: false }).limit(30)
      if (error) throw workReportError(error)
      return NextResponse.json({ items: data }, { headers })
    }
    const page = z.coerce.number().int().min(0).max(333).safeParse(q.get("page") || 0)
    if (!page.success) throw new WorkReportError("Invalid page.", 400)
    if (kind === "history") {
      const { data, error } = await actor.supabase.from("daily_work_reports").select("id,report_date,draft_open,latest_version,updated_at").eq("organization_id", actor.organizationId).eq("author_id", actor.userId).order("report_date", { ascending: false }).range(page.data * 30, page.data * 30 + 29)
      if (error) throw workReportError(error)
      const ids = (data ?? []).map(item => item.id)
      const checks = ids.length ? await actor.supabase.from("daily_work_report_versions").select("report_id,checked_at").eq("organization_id", actor.organizationId).eq("is_latest", true).in("report_id", ids) : { data: [], error: null }
      if (checks.error) throw workReportError(checks.error)
      return NextResponse.json({ items: (data ?? []).map(item => ({ ...item, checked_at: checks.data?.find(v => v.report_id === item.id)?.checked_at ?? null })) }, { headers })
    }
    if (kind !== "team" || !actor.roles.some(r => ["supervisor", "administrator"].includes(r.code))) throw new WorkReportError("Access denied.", 403)
    let query = actor.supabase.from("daily_work_report_received").select(versionSummaryColumns).eq("organization_id", actor.organizationId).eq("recipient_id", actor.userId).order("submitted_at", { ascending: false }).order("id", { ascending: false })
    if (date) query = query.eq("report_date", date)
    const author = q.get("author")
    if (author) { if (!z.uuid().safeParse(author).success) throw new WorkReportError("Invalid employee.", 400); query = query.eq("author_id", author) }
    const [{ data, error }, authors] = await Promise.all([query.range(page.data * 30, page.data * 30 + 29), actor.supabase.rpc("daily_work_report_authors")])
    if (error) throw workReportError(error)
    if (authors.error) throw workReportError(authors.error)
    return NextResponse.json({ items: await getReceivedReportPreviews(actor, data ?? []), authors: authors.data }, { headers })
  } catch (error) { return fail(error) }
}
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  try { if (origin && new URL(origin).host !== (request.headers.get("host") || request.nextUrl.host)) return NextResponse.json({ error: "Use the Jota site to update reports." }, { status: 403, headers }) } catch { return NextResponse.json({ error: "Invalid origin." }, { status: 403, headers }) }
  const actor = await getWorkspaceRequestContext()
  if (!actor) return NextResponse.json({ error: "Sign in with an active account." }, { status: 401, headers })
  try {
    const raw = await request.text()
    if (raw.length > 180000) throw new WorkReportError("Report is too large.", 413)
    let json: unknown
    try { json = JSON.parse(raw) } catch { throw new WorkReportError("Invalid request.", 400) }
    const parsed = mutations.safeParse(json)
    if (!parsed.success) throw new WorkReportError("Check the report fields and try again.", 400)
    const d = parsed.data
    const rpc = d.action === "save" ? actor.supabase.rpc("daily_work_report_save", { p_date: d.date, p_entries: d.entries, p_recipient: d.recipient, p_revision: d.revision, p_request: d.requestId })
      : d.action === "submit" ? actor.supabase.rpc("daily_work_report_submit", { p_report: d.reportId, p_revision: d.revision, p_request: d.requestId })
      : d.action === "correct" ? actor.supabase.rpc("daily_work_report_correct", { p_report: d.reportId, p_revision: d.revision })
      : actor.supabase.rpc("daily_work_report_check", { p_version: d.versionId })
    const { data, error } = await rpc
    if (error) throw workReportError(error)
    return NextResponse.json({ result: data }, { headers })
  } catch (error) { return fail(error) }
}
