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
  const { realtimeStatus, refreshWorkflowNow } = useWorkflow()
  return <div>
    <span data-testid="realtime-status">{realtimeStatus}</span>
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
})

describe("task realtime recovery", () => {
  it("shows a disconnected state and returns to connected after a focus-triggered reconnect", () => {
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
  })

  it("refreshes work on focus and exposes a manual refresh", async () => {
    renderProvider()
    act(() => realtime.emitStatus("SUBSCRIBED"))

    fireEvent.focus(window)
    await waitFor(() => expect(realtime.refresh).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole("button", { name: "Refresh data now" }))
    expect(realtime.refresh).toHaveBeenCalledTimes(2)
  })

  it("marks a silent connection attempt as interrupted", () => {
    vi.useFakeTimers()
    renderProvider()

    act(() => vi.advanceTimersByTime(12_000))
    expect(screen.getByTestId("realtime-status")).toHaveTextContent("reconnecting")
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
  })
})
