import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CalendarWorkspace } from "@/features/calendar/calendar-workspace"

const workflow = vi.hoisted(() => ({
  ready: false,
  loading: false,
  error: null as string | null,
  ensure: vi.fn().mockResolvedValue(true),
  push: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: workflow.push }) }))

vi.mock("@/features/workflow/workflow-provider", () => ({
  useWorkflow: () => ({
    workflowDataReady: workflow.ready,
    workflowDataLoading: workflow.loading,
    error: workflow.error,
    ensureWorkflowData: workflow.ensure,
  }),
}))

vi.mock("@/features/calendar/content-calendar", () => ({
  ContentCalendar: ({ monthKey, onMonthChange }: { monthKey: string; onMonthChange: (monthKey: string) => void }) => <div data-testid="calendar-content">Scheduled content calendar: {monthKey}<button type="button" onClick={() => onMonthChange("2026-11")}>Next month</button></div>,
}))

afterEach(() => {
  cleanup()
  workflow.ready = false
  workflow.loading = false
  workflow.error = null
  workflow.ensure.mockClear()
  workflow.push.mockClear()
})

describe("CalendarWorkspace", () => {
  it("shows scheduled content while loading task deadlines", async () => {
    render(<CalendarWorkspace monthKey="2026-10" contentPosts={[]} />)

    expect(screen.getByTestId("calendar-content")).toHaveTextContent("Scheduled content calendar: 2026-10")
    expect(screen.getByRole("status")).toHaveTextContent("Loading task deadlines")
    await waitFor(() => expect(workflow.ensure).toHaveBeenCalledTimes(1))
  })

  it("offers a retry when task deadlines fail to load", async () => {
    workflow.error = "Could not load workspace data."
    render(<CalendarWorkspace monthKey="2026-10" contentPosts={[]} />)

    await waitFor(() => expect(workflow.ensure).toHaveBeenCalledTimes(1))
    expect(screen.getByRole("alert")).toHaveTextContent("You can still use the calendar")
    fireEvent.click(screen.getByRole("button", { name: "Retry task deadlines" }))
    expect(workflow.ensure).toHaveBeenCalledTimes(2)
  })

  it("does not refetch a ready workflow summary", () => {
    workflow.ready = true
    render(<CalendarWorkspace monthKey="2026-10" contentPosts={[]} />)

    expect(screen.queryByText(/task deadlines/i)).not.toBeInTheDocument()
    expect(workflow.ensure).not.toHaveBeenCalled()
  })

  it("keeps month navigation in the URL", () => {
    workflow.ready = true
    render(<CalendarWorkspace monthKey="2026-10" contentPosts={[]} />)

    fireEvent.click(screen.getByRole("button", { name: "Next month" }))
    expect(workflow.push).toHaveBeenCalledWith("/calendar?month=2026-11", { scroll: false })
  })
})
