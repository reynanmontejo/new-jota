import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  channel: { on: vi.fn(), subscribe: vi.fn() },
  removeChannel: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }))
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => mocks.channel,
    removeChannel: mocks.removeChannel,
  }),
}))

import { NotificationBell } from "@/features/notifications/notification-bell"

const taskNotification = {
  id: "notification-1",
  recipient_id: "employee-1",
  type: "task_assigned",
  title: "Task assigned: Prepare the brief",
  body: "You have been assigned to this task.",
  entity_type: "task",
  entity_id: "task-1",
  href: "/tasks/task-1",
  read_at: null,
  created_at: "2026-10-19T08:00:00.000Z",
}

describe("task assignment notification navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.channel.on.mockReturnThis()
    mocks.channel.subscribe.mockReturnThis()
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: true, json: async () => ({ success: true }) }
      if (String(input).includes("preferences")) return { ok: true, json: async () => ({ soundEnabled: false }) }
      return { ok: true, json: async () => ({ notifications: [taskNotification], unreadCount: 1 }) }
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("navigates to the assigned task page when clicked", async () => {
    const onNavigate = vi.fn()
    render(<NotificationBell
      currentUser={{ id: "employee-1", name: "Employee One", role: "employee" }}
      demoMode={false}
      onNavigate={onNavigate}
    />)

    fireEvent.click(await screen.findByRole("button", { name: "1 unread notifications" }))
    fireEvent.click(await screen.findByText("Task assigned: Prepare the brief"))

    expect(mocks.push).toHaveBeenCalledWith("/tasks/task-1")
    expect(onNavigate).toHaveBeenCalledOnce()
  })

  it("shows a clickable in-browser banner for each new realtime notification", async () => {
    render(<NotificationBell
      currentUser={{ id: "employee-1", name: "Employee One", role: "employee" }}
      demoMode={false}
    />)

    await screen.findByRole("button", { name: "1 unread notifications" })
    const insertSubscription = mocks.channel.on.mock.calls.find(([, filter]) => (filter as { event?: string }).event === "INSERT")
    const onInsert = insertSubscription?.[2] as ((event: { new: typeof taskNotification }) => void) | undefined
    expect(onInsert).toBeTypeOf("function")

    const newNotification = { ...taskNotification, id: "notification-2", title: "New assignment: Review the draft" }
    act(() => onInsert?.({ new: newNotification }))

    const banner = await screen.findByRole("button", { name: "Open notification: New assignment: Review the draft" })
    expect(screen.getByText("You have been assigned to this task.")).toBeInTheDocument()
    fireEvent.click(banner)

    expect(mocks.push).toHaveBeenCalledWith("/tasks/task-1")
  })

  it("shows the in-browser banner when Settings sends a notification preview", async () => {
    render(<NotificationBell
      currentUser={{ id: "employee-1", name: "Employee One", role: "employee" }}
      demoMode={false}
    />)

    await screen.findByRole("button", { name: "1 unread notifications" })
    act(() => window.dispatchEvent(new CustomEvent("jota-notification-preview", {
      detail: {
        ...taskNotification,
        id: "notification-test-preview",
        type: "notification_test",
        title: "Jota test notification",
        body: "Test banner preview.",
        href: "/settings",
      },
    })))

    expect(await screen.findByRole("button", { name: "Open notification: Jota test notification" })).toBeInTheDocument()
    expect(screen.getByText("Test banner preview.")).toBeInTheDocument()
  })
})
