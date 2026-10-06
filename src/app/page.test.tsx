import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}))

import { WorkflowProvider } from "@/features/workflow/workflow-provider"
import { TaskDrawerProvider } from "@/features/tasks/task-drawer"
import Home from "./page"

afterEach(cleanup)

function renderDashboard() {
  return render(
    <WorkflowProvider>
      <TaskDrawerProvider><Home /></TaskDrawerProvider>
    </WorkflowProvider>,
  )
}

function renderAuthenticatedDashboard() {
  return render(
    <WorkflowProvider
      demoMode={false}
      initialUser={{ id: "admin-1", name: "Test Admin", role: "supervisor", title: "Administrator" }}
      initialTasks={[]}
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

  it("renders authorized workspace clients and scheduled content in authenticated mode", () => {
    renderAuthenticatedDashboard()

    expect(screen.getByText("Live Client")).toBeInTheDocument()
    expect(screen.getByText("Database Schedule")).toBeInTheDocument()
    expect(screen.queryByText("Luma Skincare")).not.toBeInTheDocument()
    expect(screen.queryByText("Founder story reel")).not.toBeInTheDocument()
  })
})
