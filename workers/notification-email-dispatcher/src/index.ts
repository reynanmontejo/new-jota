interface EmailWorkerEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  BREVO_API_KEY: string
  BREVO_SENDER_EMAIL: string
  BREVO_SENDER_NAME: string
  APP_BASE_URL: string
}

interface QueueItem {
  queue_id: string
  notification_id: string
  recipient_id: string
  recipient_email: string
  title: string
  body: string | null
  href: string | null
  attempts: number
}

interface ScheduledController {
  cron: string
  scheduledTime: number
}

const batchSize = 10
const brevoSendUrl = "https://api.brevo.com/v3/smtp/email"

const emailDispatcher = {
  async scheduled(controller: ScheduledController, env: EmailWorkerEnv) {
    void controller
    await dispatchQueuedEmails(env)
  },
  async fetch() {
    return new Response("Not found", { status: 404 })
  },
}

export default emailDispatcher

async function dispatchQueuedEmails(env: EmailWorkerEnv) {
  validateEnvironment(env)
  const baseUrl = new URL(env.APP_BASE_URL)
  if (baseUrl.protocol !== "https:") throw new Error("APP_BASE_URL must use HTTPS.")

  const claimedResponse = await fetch(`${normalizeOrigin(env.SUPABASE_URL)}/rest/v1/rpc/claim_notification_email_batch`, {
    method: "POST",
    headers: supabaseHeaders(env),
    body: JSON.stringify({ p_limit: batchSize }),
  })
  if (!claimedResponse.ok) throw new Error(`Could not claim email notifications (${claimedResponse.status}).`)
  const rows = await claimedResponse.json() as QueueItem[]
  const result = { claimed: rows.length, sent: 0, failed: 0 }

  for (const item of rows) {
    try {
      const sendResponse = await fetch(brevoSendUrl, {
        method: "POST",
        headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
          to: [{ email: item.recipient_email }],
          subject: safeSubject(item.title),
          textContent: formatNotificationEmail(item, baseUrl),
          tags: ["jota-notification"],
        }),
      })
      if (!sendResponse.ok) {
        await finishAttempt(env, item.queue_id, false, `Email provider returned ${sendResponse.status}.`)
        result.failed += 1
        continue
      }
      await finishAttempt(env, item.queue_id, true)
      result.sent += 1
    } catch {
      await finishAttempt(env, item.queue_id, false, "Email provider request failed.")
      result.failed += 1
    }
  }

  console.log("Notification email dispatch finished", result)
  return result
}

export function formatNotificationEmail(item: Pick<QueueItem, "title" | "body" | "href">, baseUrl: URL) {
  const path = safeInternalPath(item.href)
  const lines = [
    "You have a new notification in Jota.",
    "",
    item.title.trim().slice(0, 180),
    item.body?.trim().slice(0, 500) || "Open Jota to view the details.",
    "",
    `Open Jota: ${new URL(path, baseUrl).toString()}`,
    "",
    "You can manage email alerts in Jota Settings.",
  ]
  return lines.join("\n")
}

function safeSubject(title: string) {
  const compact = title.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 140)
  return compact ? `Jota: ${compact}` : "A new notification in Jota"
}

function safeInternalPath(href: string | null) {
  if (!href || !href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return "/"
  try {
    const resolved = new URL(href, "https://jota.invalid")
    return resolved.origin === "https://jota.invalid" ? `${resolved.pathname}${resolved.search}${resolved.hash}` : "/"
  } catch {
    return "/"
  }
}

function normalizeOrigin(value: string) {
  const url = new URL(value)
  if (url.protocol !== "https:") throw new Error("SUPABASE_URL must use HTTPS.")
  return url.origin
}

function supabaseHeaders(env: EmailWorkerEnv) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
    accept: "application/json",
  }
}

async function finishAttempt(env: EmailWorkerEnv, queueId: string, success: boolean, error?: string) {
  const response = await fetch(`${normalizeOrigin(env.SUPABASE_URL)}/rest/v1/rpc/finish_notification_email_attempt`, {
    method: "POST",
    headers: supabaseHeaders(env),
    body: JSON.stringify({ p_queue_id: queueId, p_success: success, p_error: error ?? null }),
  })
  if (!response.ok) throw new Error(`Could not update email queue state (${response.status}).`)
}

function validateEnvironment(env: EmailWorkerEnv) {
  const required: Array<keyof EmailWorkerEnv> = [
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BREVO_API_KEY", "BREVO_SENDER_EMAIL", "BREVO_SENDER_NAME", "APP_BASE_URL",
  ]
  if (required.some((key) => !env[key]?.trim())) throw new Error("Notification email dispatcher has missing environment configuration.")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BREVO_SENDER_EMAIL)) throw new Error("BREVO_SENDER_EMAIL is invalid.")
}
