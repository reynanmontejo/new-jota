import { NextRequest, NextResponse } from "next/server"

import { getStorageActor } from "@/lib/storage/authorization"

export const runtime = "nodejs"

export async function GET() {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? ""
  const available = Boolean(publicKey && process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() && process.env.WEB_PUSH_SUBJECT?.trim())
  return NextResponse.json({ available, publicKey: available ? publicKey : null }, {
    headers: { "cache-control": "private, no-store" },
  })
}

export async function POST(request: NextRequest) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })

  let payload: {
    action?: unknown
    subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
    endpoint?: unknown
  }
  try { payload = await request.json() as typeof payload } catch { return NextResponse.json({ error: "Invalid push subscription request." }, { status: 400 }) }

  if (payload.action === "subscribe") {
    if (!process.env.WEB_PUSH_VAPID_PUBLIC_KEY || !process.env.WEB_PUSH_VAPID_PRIVATE_KEY || !process.env.WEB_PUSH_SUBJECT) {
      return NextResponse.json({ error: "Browser push is not configured on this Jota server yet." }, { status: 503 })
    }
    const subscription = payload.subscription
    const endpoint = typeof subscription?.endpoint === "string" ? subscription.endpoint : ""
    const p256dh = typeof subscription?.keys?.p256dh === "string" ? subscription.keys.p256dh : ""
    const auth = typeof subscription?.keys?.auth === "string" ? subscription.keys.auth : ""
    if (!isAllowedPushEndpoint(endpoint) || endpoint.length > 2048 || p256dh.length < 40 || p256dh.length > 200 || auth.length < 16 || auth.length > 100) {
      return NextResponse.json({ error: "The browser returned an invalid push subscription." }, { status: 400 })
    }
    const { error } = await actor.supabase.rpc("register_notification_push_subscription_for_current_user", {
      p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth,
    })
    if (error?.code === "PGRST202") return NextResponse.json({ error: "Apply the browser push migration, then try again." }, { status: 503 })
    if (error) return NextResponse.json({ error: "The browser push subscription could not be saved." }, { status: 503 })
    return NextResponse.json({ success: true, pushEnabled: true }, { headers: { "cache-control": "private, no-store" } })
  }

  if (payload.action === "unsubscribe") {
    const endpoint = typeof payload.endpoint === "string" ? payload.endpoint : ""
    if (endpoint && (!endpoint.startsWith("https://") || endpoint.length > 2048)) return NextResponse.json({ error: "Choose a valid push subscription." }, { status: 400 })
    const { error } = await actor.supabase.rpc("remove_notification_push_subscription_for_current_user", { p_endpoint: endpoint || null })
    if (error?.code === "PGRST202") return NextResponse.json({ error: "Apply the browser push migration, then try again." }, { status: 503 })
    if (error) return NextResponse.json({ error: "The browser push subscription could not be removed." }, { status: 503 })
    return NextResponse.json({ success: true }, { headers: { "cache-control": "private, no-store" } })
  }

  return NextResponse.json({ error: "Choose subscribe or unsubscribe." }, { status: 400 })
}

function isAllowedPushEndpoint(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return url.protocol === "https:" && (host === "fcm.googleapis.com"
      || host === "push.services.mozilla.com" || host.endsWith(".push.services.mozilla.com")
      || host === "notify.windows.com" || host.endsWith(".notify.windows.com")
      || host === "web.push.apple.com")
  } catch { return false }
}
