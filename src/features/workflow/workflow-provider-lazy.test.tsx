import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => false }))

import { useWorkflow, WorkflowProvider } from "@/features/workflow/workflow-provider"

function Probe() {
  const { tasks, clients, workflowDataReady, workflowDataLoading, ensureWorkflowData } = useWorkflow()
  return <div>
    <span data-testid="ready">{String(workflowDataReady)}</span>
    <span data-testid="loading">{String(workflowDataLoading)}</span>
    <span data-testid="tasks">{tasks.length}</span>
    <span data-testid="clients">{clients.length}</span>
    <button onClick={() => void ensureWorkflowData()}>Load workspace data</button>
  </div>
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("light workspace data", () => {
  it("starts without demo records and fetches the summary only on demand", async () => {
    const summary = { tasks: [], clients: [{ id: "client-1", name: "Client One" }], assignableUsers: [], upcomingContent: [], contentWorkItems: [] }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ summary }) })
    vi.stubGlobal("fetch", fetchMock)

    render(<WorkflowProvider demoMode={false} initialUser={{ id: "user-1", name: "User One", role: "employee" }}><Probe /></WorkflowProvider>)

    expect(screen.getByTestId("ready")).toHaveTextContent("false")
    expect(screen.getByTestId("tasks")).toHaveTextContent("0")
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Load workspace data" }))
    fireEvent.click(screen.getByRole("button", { name: "Load workspace data" }))

    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("true"))
    expect(screen.getByTestId("clients")).toHaveTextContent("1")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith("/api/workflow-summary", { cache: "no-store" })
  })
})
