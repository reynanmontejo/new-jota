import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getWorkspaceRequestContext } from "@/lib/supabase/request-context"
import { parseReportCommand } from "@/features/assistant/assistant-help"
import { answerAssistant } from "@/lib/assistant/answer"
import { isAssistantSameOrigin } from "@/lib/assistant/request-origin"
import { generateReport, readReportWorkspace, ReportError, reportMutationError } from "@/lib/assistant/daily-reports"

const schema = z.object({ message: z.string().trim().min(1).max(2000), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(8).default([]), date: z.iso.date().optional(), requestId: z.uuid() })
const headers = { "cache-control": "private, no-store" }
export async function POST(request: NextRequest) {
  if (!isAssistantSameOrigin(request)) return NextResponse.json({ error: "Open the assistant in Jota." }, { status: 403, headers })
  const actor = await getWorkspaceRequestContext()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401, headers })
  try {
    const raw = await request.text()
    if (raw.length > 24000) return NextResponse.json({ error: "Message is too large." }, { status: 413, headers })
    let input: unknown
    try { input = JSON.parse(raw) } catch { return NextResponse.json({ error: "Invalid assistant message." }, { status: 400, headers }) }
    const parsed = schema.safeParse(input)
    if (!parsed.success) return NextResponse.json({ error: "Use a shorter message and try again." }, { status: 400, headers })
    const { message, history, date, requestId } = parsed.data
    const command = parseReportCommand(message)
    if (command?.action === "note") {
      if (!command.body) return NextResponse.json({ error: "Add your work update after Save:." }, { status: 400, headers })
      const workspace = await readReportWorkspace(actor, date)
      const { error } = await actor.supabase.rpc("save_daily_report_note", { p_date: workspace.date, p_body: command.body, p_request_id: requestId })
      if (error) throw reportMutationError(error)
      return NextResponse.json({ reply: `Saved to your report notes for ${workspace.date}:\n${command.body}`, mode: "report", reportChanged: true, sources: [] }, { headers })
    }
    if (command?.action === "generate") {
      await generateReport(actor, date)
      return NextResponse.json({ reply: "Your daily report draft is ready in Report. Review it before sending. Nothing has been submitted automatically.", mode: "report", reportChanged: true, openReport: true, sources: [] }, { headers })
    }
    return NextResponse.json(await answerAssistant(actor, message, history), { headers })
  } catch (error) { return NextResponse.json({ error: error instanceof ReportError ? error.message : "The assistant could not respond. Your message is still here; please retry." }, { status: error instanceof ReportError ? error.status : 503, headers }) }
}
