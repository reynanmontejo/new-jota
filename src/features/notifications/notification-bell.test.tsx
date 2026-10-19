import { cleanup, fireEvent, render, screen } from "@testing-library/react"
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
})
