import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  openTask: vi.fn(),
  clients: [{ id: "client-1", name: "Northwind", campaigns: [], members: [{ id: "employee-1", name: "Employee One", role: "Employee" }] }],
  assignableUsers: [{ id: "employee-1", name: "Employee One", role: "Employee" }],
  currentUser: { id: "admin-1", name: "Admin User", role: "supervisor", title: "Administrator" },
}))

vi.mock("@/features/workflow/workflow-provider", () => ({ useWorkflow: () => ({ ...mocks, demoMode: false }) }))
vi.mock("@/features/tasks/task-drawer", () => ({ useTaskDrawer: () => ({ openTask: mocks.openTask }) }))
vi.mock("@/app/tasks/actions", () => ({ createTaskAction: vi.fn() }))

import { NewTaskSheet } from "@/features/tasks/new-task-sheet"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("new task sheet for supervisors and administrators", () => {
  it("allows a supervisor/admin to assign an active employee without choosing a client", async () => {
    mocks.createTask.mockResolvedValue("task-1")
    const onOpenChange = vi.fn()
    render(<NewTaskSheet open seed={null} onOpenChange={onOpenChange} />)

    const assignee = screen.getByLabelText("Assign to") as HTMLSelectElement
    expect(assignee.value).toBe("admin-1")
    expect((screen.getByLabelText("Client (optional)") as HTMLSelectElement).value).toBe("")
    expect((screen.getByLabelText(/^Campaign/) as HTMLSelectElement).value).toBe("")
    expect(screen.getByRole("option", { name: /Employee One/ })).toBeInTheDocument()

    fireEvent.change(assignee, { target: { value: "employee-1" } })
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Prepare the campaign brief" } })
    fireEvent.click(screen.getByRole("button", { name: "Create task" }))

    await waitFor(() => expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: "Prepare the campaign brief",
      clientId: null,
      clientName: "No client",
      assigneeId: "employee-1",
      campaign: "",
    })))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.openTask).toHaveBeenCalledWith("task-1")
  })
})
