import { NextResponse } from "next/server"

import { loadWorkflowData } from "@/features/workflow/workflow-data"
import { getAuthenticatedAppUser } from "@/lib/supabase/profile"

export async function GET() {
  if (!await getAuthenticatedAppUser()) {
    return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })
  }

  try {
    const summary = await loadWorkflowData()
    return NextResponse.json({ summary }, { headers: { "cache-control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Workspace data could not be loaded." }, { status: 503 })
  }
}
