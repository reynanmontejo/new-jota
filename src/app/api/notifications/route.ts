import { NextRequest, NextResponse } from "next/server"

import { getStorageActor } from "@/lib/storage/authorization"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET() {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })

  const [notificationResult, unreadResult] = await Promise.all([
    actor.supabase.from("notifications")
      .select("id,type,title,body,entity_type,entity_id,href,read_at,created_at")
      .eq("organization_id", actor.organizationId)
      .eq("recipient_id", actor.userId)
      .order("created_at", { ascending: false })
      .limit(25),
    actor.supabase.from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", actor.organizationId)
      .eq("recipient_id", actor.userId)
      .is("read_at", null),
  ])
  if (notificationResult.error || unreadResult.error) {
    return NextResponse.json({ error: "Notifications could not be loaded. Check the notification migration and access policies." }, { status: 503 })
  }
  return NextResponse.json({ notifications: notificationResult.data ?? [], unreadCount: unreadResult.count ?? 0 }, {
    headers: { "cache-control": "private, no-store" },
  })
}

export async function POST(request: NextRequest) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })

  let payload: { notificationId?: unknown; markAllRead?: unknown }
  try { payload = await request.json() as typeof payload } catch { return NextResponse.json({ error: "Invalid notification request." }, { status: 400 }) }

  if (payload.markAllRead === true) {
    const { data, error } = await actor.supabase.rpc("mark_all_notifications_read_for_current_user")
    if (error) return notificationMutationError(error.code)
    return NextResponse.json({ success: true, changed: data ?? 0 }, { headers: { "cache-control": "private, no-store" } })
  }
  if (typeof payload.notificationId !== "string" || !uuidPattern.test(payload.notificationId)) {
    return NextResponse.json({ error: "Choose a valid notification." }, { status: 400 })
  }
  const { data, error } = await actor.supabase.rpc("mark_notification_read_for_current_user", { p_notification_id: payload.notificationId })
  if (error) return notificationMutationError(error.code)
  return NextResponse.json({ success: true, changed: Boolean(data) }, { headers: { "cache-control": "private, no-store" } })
}

function notificationMutationError(code?: string) {
  if (code === "PGRST202") return NextResponse.json({ error: "Apply the persistent notification migration, then try again." }, { status: 503 })
  return NextResponse.json({ error: "The notification could not be updated." }, { status: 503 })
}
