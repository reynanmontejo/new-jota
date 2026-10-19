import { NextRequest, NextResponse } from "next/server"

import { getStorageActor } from "@/lib/storage/authorization"

export async function GET() {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })
  const { data, error } = await actor.supabase.from("notification_preferences")
    .select("sound_enabled,email_enabled")
    .eq("organization_id", actor.organizationId)
    .eq("user_id", actor.userId)
    .maybeSingle()
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    const legacyResult = await actor.supabase.from("notification_preferences")
      .select("sound_enabled")
      .eq("organization_id", actor.organizationId)
      .eq("user_id", actor.userId)
      .maybeSingle()
    if (legacyResult.error) return NextResponse.json({ error: "Notification preferences could not be loaded. Check the notification migration." }, { status: 503 })
    return NextResponse.json({ soundEnabled: legacyResult.data?.sound_enabled ?? false, emailEnabled: false, emailAvailable: false }, {
      headers: { "cache-control": "private, no-store" },
    })
  }
  if (error) return NextResponse.json({ error: "Notification preferences could not be loaded. Check the notification migration." }, { status: 503 })
  return NextResponse.json({
    soundEnabled: data?.sound_enabled ?? false,
    emailEnabled: data?.email_enabled ?? false,
    emailAvailable: true,
  }, { headers: { "cache-control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })
  let payload: { soundEnabled?: unknown; emailEnabled?: unknown }
  try { payload = await request.json() as typeof payload } catch { return NextResponse.json({ error: "Invalid preference request." }, { status: 400 }) }
  if (payload.soundEnabled === undefined && payload.emailEnabled === undefined) {
    return NextResponse.json({ error: "Choose a notification preference to update." }, { status: 400 })
  }

  if (payload.soundEnabled !== undefined) {
    if (typeof payload.soundEnabled !== "boolean") return NextResponse.json({ error: "Choose whether sound alerts are on or off." }, { status: 400 })
    const { error } = await actor.supabase.rpc("set_notification_sound_preference_for_current_user", { p_sound_enabled: payload.soundEnabled })
    if (error?.code === "PGRST202") return NextResponse.json({ error: "Apply the persistent notification migration, then try again." }, { status: 503 })
    if (error) return NextResponse.json({ error: "The sound preference could not be saved." }, { status: 503 })
  }

  if (payload.emailEnabled !== undefined) {
    if (typeof payload.emailEnabled !== "boolean") return NextResponse.json({ error: "Choose whether email alerts are on or off." }, { status: 400 })
    const { error } = await actor.supabase.rpc("set_notification_email_preference_for_current_user", { p_email_enabled: payload.emailEnabled })
    if (error?.code === "PGRST202") return NextResponse.json({ error: "Apply the email notification migration, then try again." }, { status: 503 })
    if (error) return NextResponse.json({ error: "The email preference could not be saved." }, { status: 503 })
  }

  return NextResponse.json({
    success: true,
    ...(payload.soundEnabled !== undefined ? { soundEnabled: payload.soundEnabled } : {}),
    ...(payload.emailEnabled !== undefined ? { emailEnabled: payload.emailEnabled } : {}),
  }, { headers: { "cache-control": "private, no-store" } })
}
