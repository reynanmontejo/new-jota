"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Bell, CheckCheck } from "lucide-react"

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
  onOpenTask,
}: {
  currentUser: DemoUser
  demoMode: boolean
  compact?: boolean
  onOpenTask: (taskId: string) => void
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const knownIds = useRef(new Set<string>())
  const soundEnabled = useRef(false)
  const unreadCountRef = useRef(0)

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" })
      const payload = await response.json() as { notifications?: NotificationItem[]; unreadCount?: number; error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Notifications could not be loaded.")
      const next = payload.notifications ?? []
      knownIds.current = new Set(next.map((item) => item.id))
      setNotifications(next)
      const count = payload.unreadCount ?? 0
      unreadCountRef.current = count
      setUnreadCount(count)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Notifications could not be loaded.")
    }
  }, [])

  useEffect(() => {
    if (demoMode || !isSupabaseConfigured()) return
    let active = true
    let refreshTimer: number | undefined
    const supabase = createSupabaseClient()
    const channel = supabase.channel(`notifications:${currentUser.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${currentUser.id}`,
      }, (event) => {
        const incoming = event.new as NotificationItem
        if (incoming.recipient_id !== currentUser.id || knownIds.current.has(incoming.id)) return
        knownIds.current.add(incoming.id)
        setNotifications((current) => [incoming, ...current.filter((item) => item.id !== incoming.id)].slice(0, 25))
        if (!incoming.read_at) {
          unreadCountRef.current += 1
          setUnreadCount(unreadCountRef.current)
        }
        if (soundEnabled.current) import("@/features/notifications/notification-sound").then(({ playNotificationChime }) => playNotificationChime())
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${currentUser.id}`,
      }, () => {
        if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
        refreshTimer = window.setTimeout(() => { if (active) void loadNotifications() }, 200)
      })
      .on("postgres_changes", {
        event: "*", schema: "public", table: "notification_preferences", filter: `user_id=eq.${currentUser.id}`,
      }, (event) => { soundEnabled.current = Boolean((event.new as { sound_enabled?: boolean }).sound_enabled) })
      .subscribe()

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
    window.addEventListener("focus", refreshWhenVisible)
    window.addEventListener("jota-notification-sound-changed", refreshSoundPreference)
    window.addEventListener("storage", refreshSoundPreferenceFromStorage)
    return () => {
      active = false
      window.clearTimeout(loadTimer)
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      window.removeEventListener("focus", refreshWhenVisible)
      window.removeEventListener("jota-notification-sound-changed", refreshSoundPreference)
      window.removeEventListener("storage", refreshSoundPreferenceFromStorage)
      void supabase.removeChannel(channel)
    }
  }, [currentUser.id, demoMode, loadNotifications])

  async function markRead(id: string) {
    const target = notifications.find((item) => item.id === id)
    if (!target || target.read_at) return
    const response = await fetch("/api/notifications", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notificationId: id }),
    })
    const payload = await response.json() as { error?: string }
    if (!response.ok) { setError(payload.error ?? "Could not mark this notification as read."); return }
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item))
    unreadCountRef.current = Math.max(0, unreadCountRef.current - 1)
    setUnreadCount(unreadCountRef.current)
  }

  async function markAllRead() {
    if (!unreadCount) return
    const response = await fetch("/api/notifications", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ markAllRead: true }),
    })
    const payload = await response.json() as { error?: string }
    if (!response.ok) { setError(payload.error ?? "Could not mark notifications as read."); return }
    const readAt = new Date().toISOString()
    setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }))
    unreadCountRef.current = 0
    setUnreadCount(0)
  }

  function activate(item: NotificationItem) {
    void markRead(item.id)
    const href = item.href && item.href.startsWith("/") && !item.href.startsWith("//") ? item.href : null
    if (href?.startsWith("/tasks/")) onOpenTask(href.slice("/tasks/".length))
  }

  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className={cn("relative", compact ? "size-8 rounded-lg" : "rounded-xl")} aria-label={`${unreadCount} unread notifications`} />}>
      <Bell className="size-[18px]" />
      {unreadCount > 0 && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent ring-2 ring-background" />}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-80 rounded-lg p-1.5">
      <div className="flex items-center justify-between px-2 py-1.5">
        <DropdownMenuLabel className="p-0 text-xs text-foreground">Notifications</DropdownMenuLabel>
        <span className="text-[10px] text-muted-foreground">{unreadCount} unread</span>
      </div>
      <DropdownMenuSeparator />
      {demoMode ? <p className="px-3 py-5 text-center text-xs text-muted-foreground">Sign in to receive workspace notifications.</p> : notifications.length ? notifications.map((item) => {
        const href = item.href && item.href.startsWith("/") && !item.href.startsWith("//") ? item.href : null
        const content = <><span className={cn("mt-1 size-1.5 shrink-0 rounded-full", item.read_at ? "bg-transparent" : "bg-primary")} /><span className="min-w-0"><span className="block text-xs font-medium">{item.title}</span>{item.body && <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{item.body}</span>}<time className="mt-1 block text-[9px] text-muted-foreground" dateTime={item.created_at}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</time></span></>
        return <DropdownMenuItem key={item.id} className="min-h-12 items-start rounded-md px-2 py-2" onClick={() => activate(item)} render={href && !href.startsWith("/tasks/") ? <Link href={href} /> : undefined}>{content}</DropdownMenuItem>
      }) : <p className="px-3 py-5 text-center text-xs text-muted-foreground">{error ?? "You’re all caught up."}</p>}
      {error && notifications.length > 0 && <p role="status" className="px-2 py-1 text-[10px] text-destructive">{error}</p>}
      <DropdownMenuSeparator />
      <DropdownMenuItem className="min-h-8 justify-center rounded-md px-2 text-xs text-primary" disabled={demoMode || unreadCount === 0} onClick={() => void markAllRead()}>
        <CheckCheck className="size-3.5" /> Mark all as read
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
