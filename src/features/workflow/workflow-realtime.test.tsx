import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const realtime = vi.hoisted(() => {
  let onStatus: ((status: string) => void) | undefined
  const refresh = vi.fn()
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn((callback: (status: string) => void) => { onStatus = callback }),
  }
  return {
    channel,
    refresh,
    router: { refresh },
    removeChannel: vi.fn().mockResolvedValue(undefined),
    emitStatus: (status: string) => onStatus?.(status),
  }
})

vi.mock("next/navigation", () => ({ useRouter: () => realtime.router }))
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }))
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ channel: () => realtime.channel, removeChannel: realtime.removeChannel }),
}))

import { useWorkflow, WorkflowProvider } from "@/features/workflow/workflow-provider"

function Probe() {
  const { tasks, realtimeStatus, refreshWorkflowNow } = useWorkflow()
  return <div>
    <span data-testid="realtime-status">{realtimeStatus}</span>
    <span data-testid="task-count">{tasks.length}</span>
    <button type="button" onClick={refreshWorkflowNow}>Refresh data now</button>
  </div>
}

function renderProvider() {
  render(<WorkflowProvider demoMode={false} initialUser={{ id: "user-1", name: "User One", role: "employee" }} initialTasks={[]}><Probe /></WorkflowProvider>)
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("task realtime recovery", () => {
  it("recovers work quietly after a focus-triggered reconnect", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ summary: { tasks: [{ id: "new-task" }], clients: [], assignableUsers: [], upcomingContent: [], contentWorkItems: [] } }) })
    vi.stubGlobal("fetch", fetchMock)
    renderProvider()
    expect(screen.getByTestId("realtime-status")).toHaveTextContent("connecting")

    act(() => realtime.emitStatus("SUBSCRIBED"))
    expect(screen.getByTestId("realtime-status")).toHaveTextContent("connected")

    act(() => realtime.emitStatus("CHANNEL_ERROR"))
    expect(screen.getByTestId("realtime-status")).toHaveTextContent("reconnecting")
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1)

    fireEvent.focus(window)
    expect(realtime.channel.subscribe).toHaveBeenCalledTimes(2)
    act(() => realtime.emitStatus("SUBSCRIBED"))
    expect(screen.getByTestId("realtime-status")).toHaveTextContent("connected")
    await waitFor(() => expect(screen.getByTestId("task-count")).toHaveTextContent("1"))
    expect(fetchMock).toHaveBeenCalledWith("/api/workflow-summary", expect.objectContaining({ cache: "no-store" }))
    expect(realtime.refresh).not.toHaveBeenCalled()
  })

  it("keeps a connected tab stable on focus and exposes a manual refresh", async () => {
    renderProvider()
    act(() => realtime.emitStatus("SUBSCRIBED"))

    fireEvent.focus(window)
    expect(realtime.refresh).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Refresh data now" }))
    expect(realtime.refresh).toHaveBeenCalledTimes(1)
  })

  it("marks a silent connection attempt as interrupted", () => {
    vi.useFakeTimers()
    renderProvider()

    act(() => vi.advanceTimersByTime(12_000))
    expect(screen.getByTestId("realtime-status")).toHaveTextContent("reconnecting")
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
  })
})
