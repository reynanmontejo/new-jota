import { NextResponse } from "next/server"

import type { InsightsContentItem } from "@/features/insights/insights-content"
import { getWorkspaceRequestContext } from "@/lib/supabase/request-context"

const pageSize = 500
const maxItems = 10_000

export async function GET() {
  const context = await getWorkspaceRequestContext()
  if (!context) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })
  const canSeeTeam = context.roles.some((role) => role.code === "administrator" || role.code === "supervisor")

  const items: InsightsContentItem[] = []
  for (let start = 0; ; start += pageSize) {
    // Paginate explicitly: PostgREST commonly limits each response to 1,000 rows.
    // Reporting must never present a silently truncated count as the total.
    let query = context.supabase.from("content_items")
      .select("id,client_id,assigned_to,created_by,content_type,content_category,status,publish_at")
      .is("deleted_at", null)
    if (!canSeeTeam) {
      // RLS still limits clients/campaigns; this additional filter keeps an
      // employee's Insights payload limited to their own assigned/created work.
      query = query.or(`assigned_to.eq.${context.userId},and(assigned_to.is.null,created_by.eq.${context.userId})`)
    }
    const { data, error } = await query.order("id")
      .range(start, start + pageSize - 1)
    if (error) {
      return NextResponse.json({ error: "Content reporting is unavailable. Check the content reporting migration and try again." }, { status: 503 })
    }
    const page = data ?? []
    if (items.length + page.length > maxItems) {
      return NextResponse.json({
        error: "Content reporting is temporarily limited to 10,000 accessible items. Archive old content or contact an administrator before retrying.",
      }, { status: 413 })
    }
    items.push(...page.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      ownerId: row.assigned_to ?? row.created_by,
      format: row.content_type,
      category: row.content_category as InsightsContentItem["category"],
      status: row.status,
      publishAt: row.publish_at,
    })))
    if (page.length < pageSize) break
  }

  return NextResponse.json({ items }, { headers: { "cache-control": "private, no-store" } })
}
