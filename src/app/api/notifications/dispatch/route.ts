import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import webpush from "web-push"

import { createServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"
export const maxDuration = 60

type PushEndpoint = { endpoint: string; p256dh: string; auth: string }
type QueueItem = {
  queue_id: string
  notification_id: string
  recipient_id: string
  title: string
  body: string | null
  href: string | null
  attempts: number
  subscriptions: PushEndpoint[]
}

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET?.trim()
  const authorization = request.headers.get("authorization") ?? ""
  if (!configuredSecret || !safeBearerMatch(authorization, configuredSecret)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 })
  }

  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.WEB_PUSH_SUBJECT?.trim()
  if (!publicKey || !privateKey || !subject) {
    return NextResponse.json({ error: "Browser push is not configured." }, { status: 503 })
  }

  try { webpush.setVapidDetails(subject, publicKey, privateKey) } catch {
    return NextResponse.json({ error: "Browser push keys are invalid." }, { status: 503 })
  }
  let service: ReturnType<typeof createServiceClient>
  try { service = createServiceClient() } catch {
    return NextResponse.json({ error: "Server database access is not configured." }, { status: 503 })
  }
  const { data, error } = await service.rpc("claim_notification_push_batch", { p_limit: 25 })
  if (error) return NextResponse.json({ error: "Push queue could not be loaded." }, { status: 503 })

  const results = { claimed: (data ?? []).length, delivered: 0, failed: 0, skipped: 0 }
  for (const item of (data ?? []) as QueueItem[]) {
    const subscriptions = Array.isArray(item.subscriptions) ? item.subscriptions : []
    if (!subscriptions.length) {
      await finish(service, item.queue_id, true)
      results.skipped += 1
      continue
    }

    let delivered = 0
    const errors: string[] = []
    for (const subscription of subscriptions) {
      if (!isAllowedPushEndpoint(subscription.endpoint)) {
        await service.from("notification_push_subscriptions").delete().eq("endpoint", subscription.endpoint)
        errors.push("Push endpoint host is not supported.")
        continue
      }
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({
          id: item.notification_id,
          title: item.title,
          body: item.body ?? "",
          url: safeNotificationPath(item.href),
        }), { TTL: 60 * 60 * 24 })
        delivered += 1
      } catch (pushError) {
        const statusCode = typeof pushError === "object" && pushError !== null && "statusCode" in pushError
          ? Number((pushError as { statusCode?: unknown }).statusCode) : 0
        if (statusCode === 404 || statusCode === 410) {
          await service.from("notification_push_subscriptions").delete().eq("endpoint", subscription.endpoint)
        }
        errors.push(`Push provider returned ${statusCode || "an error"}.`)
      }
    }

    const success = delivered > 0 || errors.length === 0
    await finish(service, item.queue_id, success, errors[0])
    if (delivered) results.delivered += 1
    else results.failed += 1
  }

  return NextResponse.json(results, { headers: { "cache-control": "no-store" } })
}

function safeBearerMatch(header: string, secret: string) {
  const supplied = Buffer.from(header)
  const expected = Buffer.from(`Bearer ${secret}`)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

function safeNotificationPath(href: string | null) {
  return href && href.startsWith("/") && !href.startsWith("//") ? href : "/"
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

async function finish(service: ReturnType<typeof createServiceClient>, queueId: string, success: boolean, error?: string) {
  await service.rpc("finish_notification_push_attempt", {
    p_queue_id: queueId,
    p_success: success,
    p_error: error ?? null,
  })
}
