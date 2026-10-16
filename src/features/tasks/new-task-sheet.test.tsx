import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  openTask: vi.fn(),
  clients: [{ id: "client-1", name: "Northwind", campaigns: [], members: [{ id: "employee-1", name: "Employee One", role: "Employee" }] }],
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
  it("defaults task assignment to the current supervisor/admin while allowing team assignment", async () => {
    mocks.createTask.mockResolvedValue("task-1")
    const onOpenChange = vi.fn()
    render(<NewTaskSheet open seed={null} onOpenChange={onOpenChange} />)

    const assignee = screen.getByLabelText("Assign to") as HTMLSelectElement
    expect(assignee.value).toBe("admin-1")
    expect(screen.getByRole("option", { name: "Employee One · Employee" })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Prepare the campaign brief" } })
    fireEvent.click(screen.getByRole("button", { name: "Create task" }))

    await waitFor(() => expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: "Prepare the campaign brief",
      assigneeId: "admin-1",
    })))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.openTask).toHaveBeenCalledWith("task-1")
  })
})
