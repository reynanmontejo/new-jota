"use client"

import { useEffect, useState } from "react"
import { BellRing, Volume2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { playNotificationChime } from "@/features/notifications/notification-sound"

export function NotificationSettings({ userId, demoMode }: { userId: string; demoMode: boolean }) {
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushAvailable, setPushAvailable] = useState(false)
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(!demoMode)
  const [saving, setSaving] = useState(false)
  const [pushSaving, setPushSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (demoMode) {
      const timer = window.setTimeout(() => {
        try { setSoundEnabled(window.localStorage.getItem(`jota-sound-alerts:${userId}`) === "true") } catch { setSoundEnabled(false) }
      }, 0)
      return () => window.clearTimeout(timer)
    }
    let active = true
    fetch("/api/notifications/preferences", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { soundEnabled?: boolean; error?: string }
        if (!response.ok) throw new Error(payload.error ?? "Could not load notification preferences.")
        if (active) setSoundEnabled(Boolean(payload.soundEnabled))
      })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Could not load notification preferences.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [demoMode, userId])

  useEffect(() => {
    if (demoMode) return
    let active = true
    Promise.all([
      fetch("/api/notifications/push", { cache: "no-store" })
        .then(async (response) => response.ok ? response.json() as Promise<{ available?: boolean; publicKey?: string | null }> : null),
      "serviceWorker" in navigator ? navigator.serviceWorker.getRegistration("/")
        .then((registration) => registration?.pushManager.getSubscription() ?? null) : Promise.resolve(null),
    ])
      .then(([payload, subscription]) => {
        if (!active) return
        setPushAvailable(Boolean(payload?.available && payload.publicKey))
        setVapidPublicKey(payload?.publicKey ?? null)
        setPushEnabled(Boolean(subscription))
      })
      .catch(() => { if (active) { setPushAvailable(false); setPushEnabled(false) } })
    return () => { active = false }
  }, [demoMode])

  async function updateSound(enabled: boolean) {
    setSaving(true)
    setMessage(null)
    try {
      if (demoMode) {
        window.localStorage.setItem(`jota-sound-alerts:${userId}`, String(enabled))
      } else {
        const response = await fetch("/api/notifications/preferences", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ soundEnabled: enabled }),
        })
        const payload = await response.json() as { error?: string }
        if (!response.ok) throw new Error(payload.error ?? "Could not save notification preferences.")
        window.localStorage.setItem(`jota-sound-alerts:${userId}`, String(enabled))
      }
      setSoundEnabled(enabled)
      window.dispatchEvent(new CustomEvent("jota-notification-sound-changed", { detail: { userId, enabled } }))
      if (enabled) playNotificationChime()
      setMessage(enabled ? "Sound alerts are on. A short test sound played." : "Sound alerts are off.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save notification preferences.")
    } finally { setSaving(false) }
  }

  async function updatePush(enabled: boolean) {
    setPushSaving(true)
    setMessage(null)
    try {
      if (demoMode) throw new Error("Browser push requires a signed-in workspace account.")
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        throw new Error("This browser does not support web push notifications.")
      }
      if (!enabled) {
        const registration = await navigator.serviceWorker.getRegistration("/")
        const subscription = await registration?.pushManager.getSubscription()
        const response = await fetch("/api/notifications/push", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "unsubscribe", endpoint: subscription?.endpoint }),
        })
        const payload = await response.json() as { error?: string }
        if (!response.ok) throw new Error(payload.error ?? "Could not turn off browser notifications.")
        await subscription?.unsubscribe()
        setPushEnabled(false)
        setMessage("Browser notifications are off for this device.")
        return
      }

      if (!pushAvailable || !vapidPublicKey) throw new Error("Browser push is not configured on this Jota server yet.")
      if (!window.isSecureContext) throw new Error("Browser push requires HTTPS (localhost is supported for local testing).")
      const permission = await Notification.requestPermission()
      if (permission !== "granted") throw new Error("Allow notifications in your browser to turn on push alerts.")
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toApplicationServerKey(vapidPublicKey),
      })
      const response = await fetch("/api/notifications/push", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "subscribe", subscription: subscription.toJSON() }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not enable browser notifications.")
      setPushEnabled(true)
      setMessage("Browser notifications are on for this device.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update browser notification settings.")
    } finally { setPushSaving(false) }
  }

  function toApplicationServerKey(base64Url: string) {
    const normalized = base64Url.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4)
    const binary = window.atob(padded)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  }

  return <section className="mt-5 rounded-lg border bg-card/80 p-5">
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary/35 text-primary"><BellRing className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold">Sound alerts</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Play a brief tone when a new notification arrives. This setting is off by default.</p></div>
          <Button type="button" role="switch" aria-checked={soundEnabled} aria-label="Sound alerts" variant={soundEnabled ? "default" : "outline"} size="sm" disabled={loading || saving} onClick={() => void updateSound(!soundEnabled)}>
            {loading ? "Loading…" : soundEnabled ? "On" : "Off"}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={loading || saving} onClick={playNotificationChime}><Volume2 className="size-3.5" /> Test sound</Button>
          <span className="text-[10px] text-muted-foreground">The browser may require a click before it allows sounds.</span>
        </div>
        {message && <p role="status" className="mt-3 text-xs text-muted-foreground">{message}</p>}
      </div>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">Browser push notifications</h2>
        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
          Receive task alerts when Jota is closed. This device must allow browser notifications. Mobile support depends on the browser and operating system.
        </p>
        {!pushAvailable && !demoMode && <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">Server push keys are not configured yet.</p>}
        {demoMode && <p className="mt-1 text-[11px] text-muted-foreground">Sign in with a workspace account to enable push.</p>}
      </div>
      <Button type="button" variant={pushEnabled ? "default" : "outline"} size="sm" disabled={pushSaving || loading || (!pushEnabled && (!pushAvailable || demoMode))} onClick={() => void updatePush(!pushEnabled)}>
        {pushSaving ? "Saving…" : pushEnabled ? "On" : "Enable"}
      </Button>
    </div>
  </section>
}
