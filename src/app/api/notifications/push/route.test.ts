import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { actor, rpc } = vi.hoisted(() => ({ actor: vi.fn(), rpc: vi.fn() }))
vi.mock("@/lib/storage/authorization", () => ({ getStorageActor: actor }))

import { POST } from "./route"

const subscription = { endpoint: "https://fcm.googleapis.com/test", keys: { p256dh: "a".repeat(65), auth: "b".repeat(24) } }
const request = (payload: unknown) => new NextRequest("https://jota.example/api/notifications/push", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
})

describe("push registration across a key change", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("WEB_PUSH_VAPID_PUBLIC_KEY", "current-key")
    vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", "private-key")
    vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:admin@example.com")
    actor.mockResolvedValue({ supabase: { rpc } })
    rpc.mockResolvedValue({ error: null })
  })
  afterEach(() => vi.unstubAllEnvs())

  it("saves a subscription only for the active public key", async () => {
    const response = await POST(request({ action: "subscribe", publicKey: "current-key", subscription }))
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("register_notification_push_subscription_for_current_user", {
      p_endpoint: subscription.endpoint, p_p256dh: subscription.keys.p256dh, p_auth: subscription.keys.auth,
    })
  })

  it.each(["previous-key", undefined])("rejects a stale browser page before writing (%s)", async (publicKey) => {
    const response = await POST(request({ action: "subscribe", publicKey, subscription }))
    expect(response.status).toBe(409)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(rpc).not.toHaveBeenCalled()
  })

  it("still allows scoped removal from an old client", async () => {
    const response = await POST(request({ action: "unsubscribe", endpoint: subscription.endpoint }))
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("remove_notification_push_subscription_for_current_user", { p_endpoint: subscription.endpoint })
  })

  it("requires a signed-in workspace account", async () => {
    actor.mockResolvedValue(null)
    expect((await POST(request({ action: "subscribe", publicKey: "current-key", subscription }))).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })
})
