import { describe, expect, it, vi } from "vitest"

import { enablePushSubscription, subscriptionMatchesKey } from "./push-subscription"

const publicKey = btoa("current-key")
function subscription(key: string | null) {
  return {
    endpoint: "https://fcm.googleapis.com/test-endpoint",
    options: { applicationServerKey: key === null ? null : Uint8Array.from(atob(key), (c) => c.charCodeAt(0)).buffer },
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription
}
function setup(existing: PushSubscription | null) {
  const next = subscription(publicKey)
  const manager = { getSubscription: vi.fn().mockResolvedValue(existing), subscribe: vi.fn().mockResolvedValue(next) } as unknown as PushManager
  return { manager, next, remove: vi.fn().mockResolvedValue(undefined), save: vi.fn().mockResolvedValue(undefined) }
}

describe("push key reconnection", () => {
  it("reuses a matching subscription without removing it", async () => {
    const existing = subscription(publicKey)
    const { manager, remove, save } = setup(existing)
    await enablePushSubscription(manager, publicKey, remove, save)
    expect(remove).not.toHaveBeenCalled()
    expect(existing.unsubscribe).not.toHaveBeenCalled()
    expect(manager.subscribe).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledWith(existing)
  })

  it.each([btoa("old-key"), null])("renews a different or unknown key (%s)", async (key) => {
    const existing = subscription(key)
    const { manager, next, remove, save } = setup(existing)
    await enablePushSubscription(manager, publicKey, remove, save)
    expect(remove).toHaveBeenCalledWith(existing.endpoint)
    expect(existing.unsubscribe).toHaveBeenCalledOnce()
    expect(manager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(publicKey), (c) => c.charCodeAt(0)) })
    expect(save).toHaveBeenCalledWith(next)
  })

  it("does not subscribe if scoped server removal fails", async () => {
    const existing = subscription(btoa("old-key"))
    const { manager, remove, save } = setup(existing)
    remove.mockRejectedValue(new Error("Could not remove"))
    await expect(enablePushSubscription(manager, publicKey, remove, save)).rejects.toThrow("Could not remove")
    expect(existing.unsubscribe).not.toHaveBeenCalled()
    expect(manager.subscribe).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it.each([false, new Error("Browser failed")])("does not create a replacement when unsubscribe fails (%s)", async (result) => {
    const existing = subscription(btoa("old-key"))
    if (result instanceof Error) vi.mocked(existing.unsubscribe).mockRejectedValue(result)
    else vi.mocked(existing.unsubscribe).mockResolvedValue(result)
    const { manager, remove, save } = setup(existing)
    await expect(enablePushSubscription(manager, publicKey, remove, save)).rejects.toThrow()
    expect(manager.subscribe).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it("cleans up a new local subscription when server registration fails", async () => {
    const { manager, next, remove, save } = setup(null)
    save.mockRejectedValue(new Error("Could not register"))
    await expect(enablePushSubscription(manager, publicKey, remove, save)).rejects.toThrow("Could not register")
    expect(next.unsubscribe).toHaveBeenCalledOnce()
  })

  it("preserves a matching existing subscription when saving fails", async () => {
    const existing = subscription(publicKey)
    const { manager, remove, save } = setup(existing)
    save.mockRejectedValue(new Error("Could not register"))
    await expect(enablePushSubscription(manager, publicKey, remove, save)).rejects.toThrow("Could not register")
    expect(existing.unsubscribe).not.toHaveBeenCalled()
  })

  it("treats an unavailable browser key as requiring reconnection", () => {
    expect(subscriptionMatchesKey(subscription(null), publicKey)).toBe(false)
    expect(subscriptionMatchesKey(subscription(publicKey), "invalid!base64")).toBe(false)
  })
})
