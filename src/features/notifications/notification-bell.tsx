"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, CheckCheck, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { DemoUser } from "@/features/workflow/task-permissions"
import { isSupabaseConfigured } from "@/lib/env"
import { createClient as createSupabaseClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { playNotificationChime, primeNotificationAudio } from "@/features/notifications/notification-sound"

type NotificationItem = {
  id: string
  recipient_id: string
  type: string
  title: string
  body: string | null
  entity_type: string | null
  entity_id: string | null
  href: string | null
  read_at: string | null
  created_at: string
}

export function NotificationBell({
  currentUser,
  demoMode,
  compact = false,
  onNavigate,
}: {
  currentUser: DemoUser
  demoMode: boolean
  compact?: boolean
  onNavigate?: () => void
}) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [toastNotifications, setToastNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const knownIds = useRef(new Set<string>())
  const soundEnabled = useRef(false)
  const unreadCountRef = useRef(0)
  const toastTimers = useRef(new Map<string, number>())
  const readRequests = useRef(new Set<string>())
  const allReadRequest = useRef(false)
  const listRevision = useRef(0)
  const loadSequence = useRef(0)

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimers.current.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    toastTimers.current.delete(id)
    setToastNotifications((current) => current.filter((item) => item.id !== id))
  }, [])

  const showToast = useCallback((item: NotificationItem) => {
    setToastNotifications((current) => [item, ...current.filter((notification) => notification.id !== item.id)])
    const existingToastTimer = toastTimers.current.get(item.id)
    if (existingToastTimer !== undefined) window.clearTimeout(existingToastTimer)
    toastTimers.current.set(item.id, window.setTimeout(() => dismissToast(item.id), 8000))
  }, [dismissToast])

  useEffect(() => () => {
    toastTimers.current.forEach((timer) => window.clearTimeout(timer))
    toastTimers.current.clear()
  }, [])

  const showDesktopNotification = useCallback(async (item: NotificationItem) => {
    if (typeof window === "undefined" || !window.isSecureContext
      || !("Notification" in window) || Notification.permission !== "granted"
      || !("serviceWorker" in navigator) || !("PushManager" in window)) return

    try {
      const registration = await navigator.serviceWorker.getRegistration("/")
      const subscription = await registration?.pushManager.getSubscription()
      if (!registration || !subscription) return
      const href = item.href && item.href.startsWith("/") && !item.href.startsWith("//") ? item.href : "/"
      await registration.showNotification(item.title, {
        body: item.body ?? "You have a new workspace update.",
        tag: item.id,
        icon: "/jota-notification-icon.svg",
        badge: "/jota-notification-icon.svg",
        data: { path: href },
      })
    } catch {
      // In-app alerts continue to work if this browser cannot show desktop notifications.
    }
  }, [])

  const loadNotifications = useCallback(async function reloadNotifications(): Promise<void> {
    const sequence = ++loadSequence.current
    const revision = listRevision.current
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" })
      const payload = await response.json() as { notifications?: NotificationItem[]; unreadCount?: number; error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Notifications could not be loaded.")
      // A response started before a live event or read action must not undo it.
      if (sequence !== loadSequence.current) return
      if (revision !== listRevision.current) return reloadNotifications()
      const next = payload.notifications ?? []
      knownIds.current = new Set(next.map((item) => item.id))
      setNotifications(next)
      const count = payload.unreadCount ?? 0
      unreadCountRef.current = count
      setUnreadCount(count)
      setError(null)
    } catch (loadError) {
      if (sequence !== loadSequence.current) return
      setError(loadError instanceof Error ? loadError.message : "Notifications could not be loaded.")
    }
  }, [])

  useEffect(() => {
    if (demoMode || !isSupabaseConfigured()) return
    let active = true
    let refreshTimer: number | undefined
    const supabase = createSupabaseClient()
    const unlockAudio = () => { primeNotificationAudio() }
    window.addEventListener("pointerdown", unlockAudio, { passive: true })
    window.addEventListener("keydown", unlockAudio)
    const channel = supabase.channel(`notifications:${currentUser.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${currentUser.id}`,
      }, (event) => {
        const incoming = event.new as NotificationItem
        if (incoming.recipient_id !== currentUser.id || knownIds.current.has(incoming.id)) return
        listRevision.current += 1
        knownIds.current.add(incoming.id)
        setNotifications((current) => [incoming, ...current.filter((item) => item.id !== incoming.id)].slice(0, 25))
        if (!incoming.read_at) {
          unreadCountRef.current += 1
          setUnreadCount(unreadCountRef.current)
        }
        showToast(incoming)
        void showDesktopNotification(incoming)
        if (soundEnabled.current) void playNotificationChime(currentUser.id)
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${currentUser.id}`,
      }, () => {
        listRevision.current += 1
        if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
        refreshTimer = window.setTimeout(() => { if (active) void loadNotifications() }, 200)
      })
      .on("postgres_changes", {
        event: "*", schema: "public", table: "notification_preferences", filter: `user_id=eq.${currentUser.id}`,
      }, (event) => { soundEnabled.current = Boolean((event.new as { sound_enabled?: boolean }).sound_enabled) })
      .subscribe((status) => { if (active && status === "SUBSCRIBED") void loadNotifications() })

    const loadTimer = window.setTimeout(() => { void loadNotifications() }, 0)
    void fetch("/api/notifications/preferences", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ soundEnabled?: boolean }> : null)
      .then((preference) => { if (active && preference) soundEnabled.current = Boolean(preference.soundEnabled) })
      .catch(() => { soundEnabled.current = false })
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void loadNotifications() }
    const refreshSoundPreference = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; enabled?: boolean }>).detail
      if (detail?.userId === currentUser.id) soundEnabled.current = Boolean(detail.enabled)
    }
    const refreshSoundPreferenceFromStorage = (event: StorageEvent) => {
      if (event.key === `jota-sound-alerts:${currentUser.id}`) soundEnabled.current = event.newValue === "true"
    }
    const showNotificationPreview = (event: Event) => {
      const preview = (event as CustomEvent<NotificationItem>).detail
      if (preview?.recipient_id === currentUser.id) showToast(preview)
    }
    window.addEventListener("focus", refreshWhenVisible)
    window.addEventListener("online", refreshWhenVisible)
    window.addEventListener("jota-notification-sound-changed", refreshSoundPreference)
    window.addEventListener("storage", refreshSoundPreferenceFromStorage)
    window.addEventListener("jota-notification-preview", showNotificationPreview)
    return () => {
      active = false
      loadSequence.current += 1
      window.clearTimeout(loadTimer)
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      window.removeEventListener("focus", refreshWhenVisible)
      window.removeEventListener("online", refreshWhenVisible)
      window.removeEventListener("pointerdown", unlockAudio)
      window.removeEventListener("keydown", unlockAudio)
      window.removeEventListener("jota-notification-sound-changed", refreshSoundPreference)
      window.removeEventListener("storage", refreshSoundPreferenceFromStorage)
      window.removeEventListener("jota-notification-preview", showNotificationPreview)
      void supabase.removeChannel(channel)
    }
  }, [currentUser.id, demoMode, loadNotifications, showDesktopNotification, showToast])

  async function markRead(id: string) {
    const target = notifications.find((item) => item.id === id)
    if (!target || target.read_at || readRequests.current.has(id) || allReadRequest.current) return
    readRequests.current.add(id)
    const revision = listRevision.current
    try {
      const response = await fetch("/api/notifications", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notificationId: id }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) { setError(payload.error ?? "Could not mark this notification as read."); return }
      const countIsCurrent = revision === listRevision.current
      listRevision.current += 1
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item))
      if (countIsCurrent) {
        unreadCountRef.current = Math.max(0, unreadCountRef.current - 1)
        setUnreadCount(unreadCountRef.current)
      }
      setError(null)
      void loadNotifications()
    } catch {
      setError("Could not mark this notification as read. Check your connection and try again.")
    } finally { readRequests.current.delete(id) }
  }

  async function markAllRead() {
    if (!unreadCount || allReadRequest.current) return
    allReadRequest.current = true
    try {
      const response = await fetch("/api/notifications", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ markAllRead: true }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) { setError(payload.error ?? "Could not mark notifications as read."); return }
      listRevision.current += 1
      const readAt = new Date().toISOString()
      setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }))
      unreadCountRef.current = 0
      setUnreadCount(0)
      setError(null)
      // Reconcile notifications arriving while the request was in flight.
      void loadNotifications()
    } catch {
      setError("Could not mark notifications as read. Check your connection and try again.")
    } finally { allReadRequest.current = false }
  }

  function activate(item: NotificationItem) {
    void markRead(item.id)
    const href = item.href && item.href.startsWith("/") && !item.href.startsWith("//")
      ? item.href
      : item.type === "task_assigned" && item.entity_id
        ? `/tasks/${encodeURIComponent(item.entity_id)}`
        : null
    if (!href) return
    const target = new URL(href, window.location.href)
    if (target.origin !== window.location.origin) return
    if (target.pathname !== window.location.pathname || target.search !== window.location.search) onNavigate?.()
    router.push(`${target.pathname}${target.search}${target.hash}`)
  }

  return <>
    <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className={cn("relative", compact ? "size-8 rounded-lg" : "rounded-xl")} aria-label={`${unreadCount} unread notifications`} />}>
      <Bell className="size-[18px]" />
      {unreadCount > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-background bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground shadow-sm">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="max-h-[min(70dvh,34rem)] w-80 overflow-y-auto rounded-lg p-1.5">
      <div className="flex items-center justify-between px-2 py-1.5">
        <DropdownMenuLabel className="p-0 text-xs text-foreground">Notifications</DropdownMenuLabel>
        <span className="text-[10px] text-muted-foreground">{unreadCount} unread</span>
      </div>
      <DropdownMenuSeparator />
      {demoMode ? <p className="px-3 py-5 text-center text-xs text-muted-foreground">Sign in to receive workspace notifications.</p> : notifications.length ? notifications.map((item) => {
        const content = <><span className={cn("mt-1 size-1.5 shrink-0 rounded-full", item.read_at ? "bg-transparent" : "bg-primary")} /><span className="min-w-0"><span className="block text-xs font-medium">{item.title}</span>{item.body && <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{item.body}</span>}<time className="mt-1 block text-[9px] text-muted-foreground" dateTime={item.created_at}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</time></span></>
        return <DropdownMenuItem key={item.id} className="min-h-12 items-start rounded-md px-2 py-2" onClick={() => activate(item)}>{content}</DropdownMenuItem>
      }) : <p className="px-3 py-5 text-center text-xs text-muted-foreground">{error ?? "You’re all caught up."}</p>}
      {error && notifications.length > 0 && <p role="status" className="px-2 py-1 text-[10px] text-destructive">{error}</p>}
      <DropdownMenuSeparator />
      <DropdownMenuItem className="min-h-8 justify-center rounded-md px-2 text-xs text-primary" disabled={demoMode || unreadCount === 0} onClick={() => void markAllRead()}>
        <CheckCheck className="size-3.5" /> Mark all as read
      </DropdownMenuItem>
    </DropdownMenuContent>
    </DropdownMenu>
    {toastNotifications.length > 0 && <div aria-label="New notifications" aria-live="polite" className="pointer-events-none fixed inset-x-3 top-16 z-[100] ml-auto flex max-h-[calc(100dvh-5rem)] w-auto max-w-sm flex-col gap-2 overflow-y-auto sm:inset-x-auto sm:right-4 sm:w-[min(24rem,calc(100vw-2rem))]">
      {toastNotifications.map((item) => <section key={item.id} role="status" className="pointer-events-auto flex items-start gap-2 overflow-hidden rounded-xl border border-border border-l-4 border-l-primary bg-card/95 p-3 text-card-foreground shadow-xl backdrop-blur-md">
        <Bell aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <button type="button" className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open notification: ${item.title}`} onClick={() => { dismissToast(item.id); activate(item) }}>
          <span className="block truncate text-sm font-semibold">{item.title}</span>
          {item.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{item.body}</span>}
          <span className="mt-1.5 block text-[10px] font-medium text-primary">Open notification</span>
        </button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Dismiss notification: ${item.title}`} onClick={() => dismissToast(item.id)}>
          <X className="size-3.5" />
        </Button>
      </section>)}
    </div>}
  </>
}
