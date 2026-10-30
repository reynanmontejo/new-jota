import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NotificationSettings } from "./notification-settings"

vi.mock("./notification-sound", () => ({
  defaultNotificationVolume: 100,
  getCustomNotificationSound: vi.fn().mockResolvedValue(null),
  getNotificationVolume: () => 100,
  maxNotificationSoundBytes: 2_000_000,
  supportedNotificationSoundTypes: [],
}))

const publicKey = btoa("current-key")
const requestPermission = vi.fn()
const unsubscribe = vi.fn()
const subscribe = vi.fn()
let permission: NotificationPermission
let existing: PushSubscription | null

function makeSubscription(key: string) {
  return {
    endpoint: "https://fcm.googleapis.com/test-endpoint",
    options: { applicationServerKey: Uint8Array.from(atob(key), (c) => c.charCodeAt(0)).buffer },
    unsubscribe,
    toJSON: () => ({ endpoint: "https://fcm.googleapis.com/test-endpoint", keys: { p256dh: "test", auth: "test" } }),
  } as unknown as PushSubscription
}

describe("notification settings key change", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permission = "granted"
    existing = makeSubscription(btoa("old-key"))
    unsubscribe.mockImplementation(async () => { existing = null; return true })
    subscribe.mockImplementation(async () => { existing = makeSubscription(publicKey); return existing })
    requestPermission.mockImplementation(async () => permission)
    vi.stubGlobal("isSecureContext", true)
    vi.stubGlobal("PushManager", class {})
    vi.stubGlobal("Notification", { get permission() { return permission }, requestPermission })
    const registration = { pushManager: { getSubscription: async () => existing, subscribe } }
    vi.stubGlobal("navigator", { serviceWorker: { getRegistration: async () => registration, register: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration) } })
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => init?.method === "POST" ? { success: true }
        : url.includes("preferences") ? { soundEnabled: true, emailEnabled: true, emailAvailable: true }
          : { available: true, publicKey },
    })))
  })

  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it("shows reconnect without prompting or modifying subscriptions on load or focus", async () => {
    render(<NotificationSettings userId="user-1" demoMode={false} />)
    expect(await screen.findByRole("button", { name: "Reconnect notifications" })).toBeEnabled()
    fireEvent.focus(window)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(requestPermission).not.toHaveBeenCalled()
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
    expect(screen.getByRole("switch", { name: "Sound alerts" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("switch", { name: "Email alerts" })).toHaveAttribute("aria-checked", "true")
  })

  it("reconnects only on click and saves the replacement before showing enabled", async () => {
    render(<NotificationSettings userId="user-1" demoMode={false} />)
    fireEvent.click(await screen.findByRole("button", { name: "Reconnect notifications" }))
    await waitFor(() => expect(screen.getByRole("switch", { name: "Computer notifications" })).toHaveAttribute("aria-checked", "true"))
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledOnce()
    const writes = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body)))
    expect(writes.map((body) => body.action)).toEqual(["unsubscribe", "subscribe"])
    expect(writes[0].endpoint).toBe("https://fcm.googleapis.com/test-endpoint")
    expect(writes[1].publicKey).toBe(publicKey)
  })

  it("shows a matching subscription as enabled without reconnecting", async () => {
    existing = makeSubscription(publicKey)
    render(<NotificationSettings userId="user-1" demoMode={false} />)
    await waitFor(() => expect(screen.getByRole("switch", { name: "Computer notifications" })).toHaveAttribute("aria-checked", "true"))
    expect(screen.queryByRole("button", { name: "Reconnect notifications" })).not.toBeInTheDocument()
    expect(subscribe).not.toHaveBeenCalled()
  })

  it("does not reconnect when permission is denied", async () => {
    permission = "denied"
    render(<NotificationSettings userId="user-1" demoMode={false} />)
    expect(await screen.findByRole("button", { name: "Reconnect notifications" })).toBeDisabled()
    expect(requestPermission).not.toHaveBeenCalled()
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it("keeps a failed replacement off and allows retry", async () => {
    vi.mocked(fetch).mockImplementation(async (url, init) => ({
      ok: !(init?.method === "POST" && JSON.parse(String(init.body)).action === "subscribe"),
      json: async () => init?.method === "POST" ? { error: "Registration failed" }
        : String(url).includes("preferences") ? { soundEnabled: true, emailEnabled: true }
          : { available: true, publicKey },
    } as Response))
    render(<NotificationSettings userId="user-1" demoMode={false} />)
    fireEvent.click(await screen.findByRole("button", { name: "Reconnect notifications" }))
    expect(await screen.findByText("Registration failed")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reconnect notifications" })).toBeEnabled()
    expect(existing).toBeNull()
    expect(screen.getByRole("switch", { name: "Email alerts" })).toHaveAttribute("aria-checked", "true")
  })
})
