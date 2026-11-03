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
import { initialWorkflowState } from "@/features/workflow/mock-data"

function Probe() {
  const { tasks, realtimeStatus, refreshWorkflowNow, refreshWorkflowQuietly, removeTask, workflowDataReady, workflowDataLoading, ensureWorkflowData } = useWorkflow()
  return <div>
    <span data-testid="realtime-status">{realtimeStatus}</span>
    <span data-testid="task-count">{tasks.length}</span>
    <span data-testid="ready">{String(workflowDataReady)}</span>
    <span data-testid="loading">{String(workflowDataLoading)}</span>
    <input aria-label="Board filter" defaultValue="My current filter" />
    <button type="button" onClick={refreshWorkflowNow}>Refresh data now</button>
    <button type="button" onClick={() => void refreshWorkflowQuietly()}>Sync quietly</button>
    <button type="button" onClick={() => removeTask(initialWorkflowState.tasks[0].id)}>Remove task</button>
    <button type="button" onClick={() => void ensureWorkflowData()}>Load tasks</button>
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
  window.history.replaceState(null, "", "/")
})

describe("task realtime recovery", () => {
  it("keeps the lazy task canvas visible while a trash event synchronizes in the background", async () => {
    window.history.replaceState(null, "", "/tasks")
    const summary = { tasks: [initialWorkflowState.tasks[0]], clients: [], assignableUsers: [], upcomingContent: [], contentWorkItems: [] }
    let finishRefresh!: (response: unknown) => void
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ summary }) })
      .mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    render(<WorkflowProvider demoMode={false} initialUser={{ id: "user-1", name: "User One", role: "employee" }}><Probe /></WorkflowProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Load tasks" }))
    await waitFor(() => expect(screen.getByTestId("task-count")).toHaveTextContent("1"))
    fireEvent.change(screen.getByLabelText("Board filter"), { target: { value: "Keep this filter" } })
    const change = realtime.channel.on.mock.calls.find((call) => call[1].table === "tasks")?.[2] as () => void
    act(() => change())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId("task-count")).toHaveTextContent("1")
    expect(screen.getByTestId("ready")).toHaveTextContent("true")
    expect(screen.getByTestId("loading")).toHaveTextContent("false")
    await act(async () => finishRefresh({ ok: true, json: async () => ({ summary: { ...summary, tasks: [] } }) }))
    expect(screen.getByTestId("task-count")).toHaveTextContent("0")
    expect(screen.getByLabelText("Board filter")).toHaveValue("Keep this filter")
    expect(realtime.refresh).not.toHaveBeenCalled()
  })

  it("does not resurrect a trashed task from a summary requested before deletion", async () => {
    const summary = { tasks: [initialWorkflowState.tasks[0]], clients: [], assignableUsers: [], upcomingContent: [], contentWorkItems: [] }
    let finishRefresh!: (response: unknown) => void
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { finishRefresh = resolve })))
    render(<WorkflowProvider demoMode={false} initialTasks={summary.tasks}><Probe /></WorkflowProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Sync quietly" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove task" }))
    expect(screen.getByTestId("task-count")).toHaveTextContent("0")
    await act(async () => finishRefresh({ ok: true, json: async () => ({ summary }) }))
    expect(screen.getByTestId("task-count")).toHaveTextContent("0")
    expect(realtime.refresh).not.toHaveBeenCalled()
  })

  it("keeps current tasks visible when background synchronization fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))
    render(<WorkflowProvider demoMode={false} initialTasks={[initialWorkflowState.tasks[0]]}><Probe /></WorkflowProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Sync quietly" }))
    await act(async () => {})
    expect(screen.getByTestId("task-count")).toHaveTextContent("1")
    expect(screen.getByTestId("ready")).toHaveTextContent("true")
    expect(realtime.refresh).not.toHaveBeenCalled()
  })
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
