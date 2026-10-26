import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}))

import { WorkflowProvider } from "@/features/workflow/workflow-provider"
import { TaskDrawerProvider } from "@/features/tasks/task-drawer"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import type { WorkflowTask } from "@/features/workflow/types"
import Home from "./(app)/(workspace)/page"

afterEach(cleanup)

it("keeps one sidebar mounted while the page content changes", () => {
  const page = (label: string) => (
    <WorkflowProvider>
      <TaskDrawerProvider>
        <DashboardShell>
          <DashboardShell><main>{label}</main></DashboardShell>
        </DashboardShell>
      </TaskDrawerProvider>
    </WorkflowProvider>
  )

  const view = render(page("First page"))
  fireEvent.click(screen.getByRole("button", { name: "Minimize sidebar" }))
  view.rerender(page("Second page"))

  expect(screen.getByText("Second page")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument()
  expect(screen.getAllByRole("navigation", { name: "Primary navigation" })).toHaveLength(1)
})

function renderDashboard() {
  return render(
    <WorkflowProvider>
      <TaskDrawerProvider><Home /></TaskDrawerProvider>
    </WorkflowProvider>,
  )
}

function renderAuthenticatedDashboard(initialTasks: WorkflowTask[] = []) {
  return render(
    <WorkflowProvider
      demoMode={false}
      initialUser={{ id: "admin-1", name: "Test Admin", role: "supervisor", title: "Administrator" }}
      initialTasks={initialTasks}
      initialClients={[{ id: "client-1", name: "Live Client" }]}
      initialUpcomingContent={[{ id: "content-1", title: "Database Schedule", clientId: "client-1", clientName: "Live Client", platform: "Instagram", publishAt: "2026-10-08T16:00:00.000Z" }]}
    >
      <TaskDrawerProvider><Home /></TaskDrawerProvider>
    </WorkflowProvider>,
  )
}

describe("Account Manager dashboard", () => {
  it("keeps urgent work and scheduled content visible as separate concepts", () => {
    renderDashboard()

    expect(screen.getByRole("heading", { level: 1, name: "Good morning, Maria" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Task summary" })).toHaveTextContent("Changes requested")
    expect(screen.getByRole("heading", { level: 2, name: "Today’s focus" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Upcoming content" })).toBeInTheDocument()
    expect(screen.getByText("Finalize launch-day captions")).toBeInTheDocument()
    expect(screen.queryByText("Founder story reel")).not.toBeInTheDocument()
  })

  it("keeps team-wide work hidden from the employee overview", () => {
    renderDashboard()

    expect(screen.queryByText("Review founder story reel")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "All" })).not.toBeInTheDocument()
  })

  it("opens calendar and task details without leaving the overview", () => {
    renderDashboard()

    expect(screen.getByRole("link", { name: "View calendar" })).toHaveAttribute(
      "href",
      "/calendar",
    )
    fireEvent.click(screen.getByRole("button", { name: "View submission" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("labels task actions distinctly and does not show a duplicate submission shortcut", async () => {
    renderDashboard()
    fireEvent.click(screen.getByRole("button", { name: "More options for Finalize launch-day captions" }))

    expect(await screen.findByRole("menuitem", { name: "Move to To do" })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Cancel task" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Open submission" })).not.toBeInTheDocument()
  })

  it("renders authorized workspace clients and scheduled content in authenticated mode", () => {
    renderAuthenticatedDashboard()

    expect(screen.getByText("Live Client")).toBeInTheDocument()
    expect(screen.getByText("Database Schedule")).toBeInTheDocument()
    expect(screen.queryByText("Luma Skincare")).not.toBeInTheDocument()
    expect(screen.queryByText("Founder story reel")).not.toBeInTheDocument()
  })

  it("hides completed and cancelled tasks from Today’s focus", () => {
    const makeTask = (id: string, title: string, status: WorkflowTask["status"]): WorkflowTask => ({
      id,
      title,
      description: "",
      clientId: "client-1",
      clientName: "Live Client",
      campaign: "General work",
      contentItem: "General work",
      priority: "medium",
      status,
      startDate: "Oct 14, 2026",
      dueDate: "Oct 14, 2026",
      primaryOwner: { id: "admin-1", name: "Test Admin", initials: "TA", role: "Supervisor" },
      collaborators: [],
      checklist: [],
      comments: [],
      versions: [],
      activity: [],
    })

    renderAuthenticatedDashboard([
      makeTask("active", "Still needs work", "todo"),
      makeTask("completed", "Already completed", "completed"),
      makeTask("cancelled", "Cancelled work", "cancelled"),
    ])

    expect(screen.getByText("Still needs work")).toBeInTheDocument()
    expect(screen.queryByText("Already completed")).not.toBeInTheDocument()
    expect(screen.queryByText("Cancelled work")).not.toBeInTheDocument()
  })
})
