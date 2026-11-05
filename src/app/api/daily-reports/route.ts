import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getWorkspaceRequestContext } from "@/lib/supabase/request-context"
import { generateReport, readReportWorkspace, ReportError, reportMutationError } from "@/lib/assistant/daily-reports"
import { isAssistantSameOrigin } from "@/lib/assistant/request-origin"

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), date: z.iso.date(), body: z.string().trim().min(1).max(20000), revision: z.number().int().min(0) }),
  z.object({ action: z.literal("send"), date: z.iso.date(), recipientId: z.uuid(), revision: z.number().int().min(0) }),
  z.object({ action: z.literal("generate"), date: z.iso.date(), replace: z.boolean().optional(), revision: z.number().int().min(0).optional() }),
])
const headers = { "cache-control": "private, no-store" }
function failure(error: unknown) { return NextResponse.json({ error: error instanceof ReportError ? error.message : "Daily reports are temporarily unavailable." }, { status: error instanceof ReportError ? error.status : 503, headers }) }

export async function GET(request: NextRequest) {
  const actor = await getWorkspaceRequestContext()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401, headers })
  try { return NextResponse.json(await readReportWorkspace(actor, request.nextUrl.searchParams.get("date") || undefined), { headers }) } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest) {
  if (!isAssistantSameOrigin(request)) return NextResponse.json({ error: "Use Jota to update your report." }, { status: 403, headers })
  const actor = await getWorkspaceRequestContext()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401, headers })
  try {
    const raw = await request.text()
    if (raw.length > 24000) return NextResponse.json({ error: "Report request is too large." }, { status: 413, headers })
    let value: unknown
    try { value = JSON.parse(raw) } catch { return NextResponse.json({ error: "Invalid report request." }, { status: 400, headers }) }
    const parsed = inputSchema.safeParse(value)
    if (!parsed.success) return NextResponse.json({ error: "Check the report details and try again." }, { status: 400, headers })
    const data = parsed.data
    if (data.action === "generate") await generateReport(actor, data.date, data.replace, data.revision)
    else {
      const { error } = data.action === "save"
        ? await actor.supabase.rpc("save_daily_report_body", { p_date: data.date, p_body: data.body, p_expected_revision: data.revision })
        : await actor.supabase.rpc("submit_daily_report", { p_date: data.date, p_recipient_id: data.recipientId, p_expected_revision: data.revision })
      if (error) throw reportMutationError(error)
    }
    return NextResponse.json(await readReportWorkspace(actor, data.date), { headers })
  } catch (error) { return failure(error) }
}
