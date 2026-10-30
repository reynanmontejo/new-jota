"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { BellRing, Mail, MonitorCheck, Music2, Trash2, Upload, Volume2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { enablePushSubscription, subscriptionMatchesKey } from "@/features/notifications/push-subscription"
import {
  defaultNotificationVolume,
  getCustomNotificationSound,
  getNotificationVolume,
  maxNotificationSoundBytes,
  primeNotificationAudio,
  playNotificationChime,
  removeCustomNotificationSound,
  saveCustomNotificationSound,
  saveNotificationVolume,
  supportedNotificationSoundTypes,
} from "@/features/notifications/notification-sound"

async function waitForServiceWorkerReady(timeoutMs = 10_000) {
  let timer: number | undefined
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("Jota's notification service worker did not start. Refresh the page and try again.")), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) window.clearTimeout(timer)
  }
}

export function NotificationSettings({ userId, demoMode }: { userId: string; demoMode: boolean }) {
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [emailAvailable, setEmailAvailable] = useState(true)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushNeedsReconnect, setPushNeedsReconnect] = useState(false)
  const pushOperation = useRef(false)
  const pushStatusSequence = useRef(0)
  const [pushAvailable, setPushAvailable] = useState(false)
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">("default")
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(!demoMode)
  const [saving, setSaving] = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)
  const [pushSaving, setPushSaving] = useState(false)
  const [testingBrowser, setTestingBrowser] = useState(false)
  const [volume, setVolume] = useState(defaultNotificationVolume)
  const [customSoundName, setCustomSoundName] = useState<string | null>(null)
  const [customSoundSaving, setCustomSoundSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      if (active) setVolume(getNotificationVolume(userId))
    }, 0)
    void getCustomNotificationSound(userId)
      .then((sound) => { if (active) setCustomSoundName(sound?.name ?? null) })
      .catch(() => { if (active) setCustomSoundName(null) })
    return () => { active = false; window.clearTimeout(timer) }
  }, [userId])

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
        const payload = await response.json() as { soundEnabled?: boolean; emailEnabled?: boolean; emailAvailable?: boolean; error?: string }
        if (!response.ok) throw new Error(payload.error ?? "Could not load notification preferences.")
        if (active) {
          setSoundEnabled(Boolean(payload.soundEnabled))
          setEmailEnabled(Boolean(payload.emailEnabled))
          setEmailAvailable(payload.emailAvailable !== false)
        }
      })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Could not load notification preferences.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [demoMode, userId])

  useEffect(() => {
    let active = true
    const refreshBrowserStatus = async () => {
      if (pushOperation.current) return
      const sequence = ++pushStatusSequence.current
      const permission = "Notification" in window && window.isSecureContext ? Notification.permission : "unsupported"
      setBrowserPermission(permission)
      const supported = window.isSecureContext && "serviceWorker" in navigator
        && "PushManager" in window && "Notification" in window
      if (!supported || demoMode) {
        setPushAvailable(false)
        setPushEnabled(false)
        setPushNeedsReconnect(false)
        setVapidPublicKey(null)
        return
      }
      try {
        const [response, registration] = await Promise.all([
          fetch("/api/notifications/push", { cache: "no-store" }),
          navigator.serviceWorker.getRegistration("/"),
        ])
        const payload = response.ok
          ? await response.json() as { available?: boolean; publicKey?: string | null }
          : null
        const subscription = await registration?.pushManager.getSubscription()
        if (!active || pushOperation.current || sequence !== pushStatusSequence.current) return
        setPushAvailable(Boolean(payload?.available && payload.publicKey))
        setVapidPublicKey(payload?.publicKey ?? null)
        const matches = Boolean(subscription && payload?.publicKey && subscriptionMatchesKey(subscription, payload.publicKey))
        setPushEnabled(matches && permission === "granted")
        setPushNeedsReconnect(Boolean(subscription && payload?.available && !matches))
      } catch {
        if (active && !pushOperation.current && sequence === pushStatusSequence.current) {
          setPushAvailable(false); setPushEnabled(false); setPushNeedsReconnect(false); setVapidPublicKey(null)
        }
      }
    }
    void refreshBrowserStatus()
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshBrowserStatus()
    }
    window.addEventListener("focus", refreshWhenVisible)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      active = false
      window.removeEventListener("focus", refreshWhenVisible)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [demoMode])

  async function updateSound(enabled: boolean) {
    if (enabled) primeNotificationAudio()
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
      if (enabled) await playNotificationChime(userId)
      setMessage(enabled ? "Sound alerts are on." : "Sound alerts are off.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save notification preferences.")
    } finally { setSaving(false) }
  }

  async function updateEmail(enabled: boolean) {
    setEmailSaving(true)
    setMessage(null)
    try {
      if (demoMode) throw new Error("Email alerts require a signed-in workspace account.")
      const response = await fetch("/api/notifications/preferences", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ emailEnabled: enabled }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not save the email preference.")
      setEmailEnabled(enabled)
      setMessage(enabled ? "Email alerts are on for new notifications." : "Email alerts are off.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the email preference.")
    } finally { setEmailSaving(false) }
  }

  function updateVolume(nextVolume: number) {
    setVolume(nextVolume)
    saveNotificationVolume(userId, nextVolume)
  }

  async function chooseCustomSound(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ""
    if (!file) return

    const validExtension = /\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(file.name)
    if (file.type && !supportedNotificationSoundTypes.includes(file.type) && !validExtension) {
      setMessage("Choose an MP3, WAV, OGG, M4A, AAC, or WebM audio file.")
      return
    }
    if (file.size > maxNotificationSoundBytes) {
      setMessage("Custom notification sounds must be 2 MB or smaller.")
      return
    }
    if (file.size === 0) {
      setMessage("That sound file is empty. Choose another audio file.")
      return
    }

    setCustomSoundSaving(true)
    setMessage(null)
    try {
      await saveCustomNotificationSound(userId, file)
      setCustomSoundName(file.name)
      setMessage("Custom sound saved. Use Test sound to preview it.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the custom sound.")
    } finally {
      setCustomSoundSaving(false)
    }
  }

  async function clearCustomSound() {
    setCustomSoundSaving(true)
    setMessage(null)
    try {
      await removeCustomNotificationSound(userId)
      setCustomSoundName(null)
      setMessage("Using Jota's default notification sound.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove the custom sound.")
    } finally {
      setCustomSoundSaving(false)
    }
  }

  async function testSound() {
    primeNotificationAudio()
    setMessage(null)
    if (volume === 0) {
      setMessage("Sound volume is at 0%. Increase it to preview the notification sound.")
      return
    }
    const played = await playNotificationChime(userId)
    if (!played) setMessage("The custom sound could not be played. Try another supported audio format.")
  }

  async function updatePush(enabled: boolean) {
    if (pushOperation.current) return
    pushOperation.current = true
    ++pushStatusSequence.current
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
        setPushNeedsReconnect(false)
        setMessage("Browser notifications are off for this device.")
        return
      }

      if (!pushAvailable || !vapidPublicKey) throw new Error("Browser push is not configured on this Jota server yet.")
      if (!window.isSecureContext) throw new Error("Browser push requires HTTPS (localhost is supported for local testing).")
      const permission = await Notification.requestPermission()
      setBrowserPermission(permission)
      if (permission !== "granted") {
        throw new Error(permission === "denied"
          ? "Notifications are blocked for this site. Allow them in your browser’s site settings, then try again."
          : "Allow notifications in the browser prompt to turn on desktop alerts.")
      }
      await navigator.serviceWorker.register("/sw.js", { scope: "/" })
      const registration = await waitForServiceWorkerReady()
      setPushEnabled(false)
      await enablePushSubscription(registration.pushManager, vapidPublicKey,
        async (endpoint) => {
          const response = await fetch("/api/notifications/push", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "unsubscribe", endpoint }),
          })
          const payload = await response.json() as { error?: string }
          if (!response.ok) throw new Error(payload.error ?? "Could not disconnect the previous browser subscription.")
        },
        async (subscription) => {
          const response = await fetch("/api/notifications/push", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "subscribe", subscription: subscription.toJSON() }),
          })
          const payload = await response.json() as { error?: string }
          if (!response.ok) throw new Error(payload.error ?? "Could not enable browser notifications.")
        })
      setPushEnabled(true)
      setPushNeedsReconnect(false)
      setMessage("Browser notifications are on for this device.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update browser notification settings.")
    } finally { pushOperation.current = false; setPushSaving(false) }
  }

  async function testBrowserNotification() {
    setTestingBrowser(true)
    setMessage(null)
    try {
      if (!window.isSecureContext || !("serviceWorker" in navigator) || !("Notification" in window)) {
        throw new Error("This browser cannot show Jota notifications here. Use a supported browser on HTTPS.")
      }
      const permission = Notification.permission
      setBrowserPermission(permission)
      if (permission !== "granted") throw new Error("Browser access is not currently allowed for this site. Allow it in the browser's site settings, then try again.")
      const createdAt = new Date().toISOString()
      const testTag = `jota-notification-test-${Date.now()}`
      window.dispatchEvent(new CustomEvent("jota-notification-preview", {
        detail: {
          id: testTag,
          recipient_id: userId,
          type: "notification_test",
          title: "Jota test notification",
          body: `Test sent at ${new Date(createdAt).toLocaleTimeString()}.`,
          entity_type: null,
          entity_id: null,
          href: "/settings",
          read_at: null,
          created_at: createdAt,
        },
      }))

      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" })
        const registration = await waitForServiceWorkerReady()
        await registration.showNotification("Jota test notification", {
          body: `Jota successfully sent this test at ${new Date(createdAt).toLocaleTimeString()}.`,
          tag: testTag,
          silent: false,
          icon: "/jota-notification-icon.svg",
          badge: "/jota-notification-icon.svg",
          data: { path: "/settings" },
        })
        setMessage("The in-app banner appeared and the browser accepted the device notification. If no desktop banner appeared, check your computer's notification and Do Not Disturb settings.")
      } catch (error) {
        setMessage(`The in-app banner appeared, but the device notification failed: ${error instanceof Error ? error.message : "browser notification error"}`)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not show a test notification.")
    } finally { setTestingBrowser(false) }
  }

  async function requestBrowserAccess() {
    setPushSaving(true)
    setMessage(null)
    try {
      if (!("Notification" in window) || !window.isSecureContext) {
        throw new Error("Browser notifications require a supported browser on HTTPS. Localhost is supported for testing.")
      }
      const permission = await Notification.requestPermission()
      setBrowserPermission(permission)
      if (permission === "granted") {
        setMessage("Browser access is allowed. Use the test button to check your computer's notification display.")
      } else if (permission === "denied") {
        setMessage("Access was blocked. Allow Notifications in this site's browser permissions, then return here.")
      } else {
        setMessage("Browser access was not allowed. You can request it again here.")
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not request browser notification access.")
    } finally { setPushSaving(false) }
  }

  const desktopStatus = demoMode
    ? "Sign in to enable desktop notifications."
    : browserPermission === "unsupported"
      ? "Desktop notifications aren't supported in this browser."
      : browserPermission === "denied"
        ? "Browser access is blocked. Allow notifications in this site's browser settings."
        : browserPermission === "default"
          ? "Browser access hasn't been granted yet."
          : !pushAvailable
            ? "Browser access is allowed, but desktop alerts aren't configured for this workspace yet."
            : pushNeedsReconnect
              ? "Reconnect required. This device uses a previous notification key. Reconnect to receive desktop alerts."
              : pushEnabled
                ? "Desktop notifications are on for this device."
                : "Browser access is allowed; desktop notifications are off on this device."

  return <section className="mt-5 rounded-lg border bg-card/80 p-5">
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary/35 text-primary"><BellRing className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold">Sound alerts</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Play a chime for new notifications while Jota is open.</p></div>
          <Button type="button" role="switch" aria-checked={soundEnabled} aria-label="Sound alerts" variant="ghost" className={`relative h-6 w-11 shrink-0 rounded-full border p-0 text-transparent hover:text-transparent before:absolute before:left-1 before:top-1/2 before:size-4 before:-translate-y-1/2 before:rounded-full before:bg-background before:shadow-sm before:transition-transform ${soundEnabled ? "border-primary bg-primary hover:bg-primary before:translate-x-5" : "border-input bg-muted hover:bg-muted before:translate-x-0"}`} disabled={loading || saving} onClick={() => void updateSound(!soundEnabled)}>
            {loading ? "Loading…" : soundEnabled ? "On" : "Off"}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={loading || saving} onClick={() => void testSound()}><Volume2 className="size-3.5" /> Test sound</Button>
        </div>
        <div className="mt-3 rounded-md border bg-background/50 p-3">
          <label htmlFor="notification-volume" className="flex items-center justify-between gap-3 text-xs font-medium">
            <span>Volume</span><span className="text-muted-foreground">{volume}%</span>
          </label>
          <input id="notification-volume" aria-label="Notification sound volume" type="range" min="0" max="100" step="5" value={volume} onChange={(event) => updateVolume(Number(event.currentTarget.value))} className="mt-2 h-2 w-full cursor-pointer accent-primary" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <Music2 className="size-4 shrink-0 text-primary" />
              <span className="truncate">{customSoundName ? `Custom: ${customSoundName}` : "Jota default sound"}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                <Upload className="size-3.5" />{customSoundSaving ? "Saving…" : "Choose sound"}
                <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/aac,audio/webm,.mp3,.wav,.ogg,.m4a,.aac,.webm" className="sr-only" disabled={customSoundSaving} onChange={(event) => void chooseCustomSound(event)} />
              </label>
              {customSoundName && <Button type="button" variant="ghost" size="sm" aria-label="Remove custom notification sound" disabled={customSoundSaving} onClick={() => void clearCustomSound()}><Trash2 className="size-3.5" /> Remove</Button>}
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">MP3, WAV, OGG, M4A, AAC, or WebM · up to 2 MB · saved in this browser.</p>
        </div>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary/35 text-primary"><Mail className="size-4" /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Email alerts</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{emailAvailable ? "Send new Jota notifications to your account email. Messages may include task titles or comment excerpts; use an inbox you control." : "Email alerts will be available after the email notification database migration is applied."}</p>
        </div>
      </div>
      <Button type="button" role="switch" aria-checked={emailEnabled} aria-label="Email alerts" variant="ghost" className={`relative h-6 w-11 shrink-0 rounded-full border p-0 text-transparent hover:text-transparent before:absolute before:left-1 before:top-1/2 before:size-4 before:-translate-y-1/2 before:rounded-full before:bg-background before:shadow-sm before:transition-transform ${emailEnabled ? "border-primary bg-primary hover:bg-primary before:translate-x-5" : "border-input bg-muted hover:bg-muted before:translate-x-0"}`} disabled={loading || emailSaving || demoMode || !emailAvailable} onClick={() => void updateEmail(!emailEnabled)}>
        {emailSaving ? "Saving…" : emailEnabled ? "On" : "Off"}
      </Button>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">Desktop notifications</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground" role="status">{desktopStatus}</p>
      </div>
      {!demoMode && !pushAvailable && browserPermission === "default" && <Button type="button" variant="outline" size="sm" disabled={pushSaving} onClick={() => void requestBrowserAccess()}>{pushSaving ? "Requesting…" : "Allow notifications"}</Button>}
      {pushAvailable && pushNeedsReconnect && <Button type="button" variant="outline" size="sm" disabled={pushSaving || loading || browserPermission === "denied"} onClick={() => void updatePush(true)}>{pushSaving ? "Reconnecting…" : "Reconnect notifications"}</Button>}
      {pushAvailable && !pushNeedsReconnect && <Button type="button" role="switch" aria-checked={pushEnabled} aria-label="Computer notifications" variant="ghost" className={`relative h-6 w-11 shrink-0 rounded-full border p-0 text-transparent hover:text-transparent before:absolute before:left-1 before:top-1/2 before:size-4 before:-translate-y-1/2 before:rounded-full before:bg-background before:shadow-sm before:transition-transform ${pushEnabled ? "border-primary bg-primary hover:bg-primary before:translate-x-5" : "border-input bg-muted hover:bg-muted before:translate-x-0"}`} disabled={pushSaving || loading || (!pushEnabled && (!pushAvailable || demoMode || browserPermission === "unsupported" || browserPermission === "denied"))} onClick={() => void updatePush(!pushEnabled)}>
        {pushSaving ? "Saving…" : pushEnabled ? "On" : browserPermission === "default" ? "Allow & enable" : browserPermission === "denied" ? "Blocked" : browserPermission === "granted" ? "Off" : "Unavailable"}
      </Button>}
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">Test notification</h3>
        <p className="mt-1 text-xs text-muted-foreground">Show a sample notification on this device.</p>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={testingBrowser || browserPermission !== "granted"} onClick={() => void testBrowserNotification()}>
        <MonitorCheck className="size-3.5" />{testingBrowser ? "Sending…" : "Test device"}
      </Button>
    </div>
    {message && <p role="status" aria-live="polite" className="mt-3 text-xs text-muted-foreground">{message}</p>}
  </section>
}
