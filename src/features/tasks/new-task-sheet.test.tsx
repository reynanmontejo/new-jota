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
  mocks.currentUser = { id: "admin-1", name: "Admin User", role: "supervisor", title: "Administrator" }
  mocks.clients[0].members.length = 1
})

describe("new task sheet for supervisors and administrators", () => {
  it("hands a linked video task to the designated editor with instructions and a checklist", async () => {
    mocks.currentUser = { id: "manager-1", name: "Account Manager", role: "employee", title: "Account Manager" }
    mocks.createTask.mockResolvedValue("task-video-1")
    render(<NewTaskSheet open seed={{ contentItemId: "content-1", contentItemTitle: "Product reel", title: "Edit product reel", clientId: "client-1", clientName: "Northwind", campaignName: "General / Ongoing", deadlineAt: null, contentCategory: "video", contentType: "Reel", contentDescription: "Cut the launch footage", videoEditorId: "employee-1" }} onOpenChange={vi.fn()} />)

    expect(screen.getByText("Video editor")).toBeInTheDocument()
    expect(screen.getByText(/Employee One/)).toBeInTheDocument()
    expect(screen.getByText(/Only the editor can start and progress/)).toBeInTheDocument()
    expect(screen.queryByLabelText("Assign to")).not.toBeInTheDocument()
    expect((screen.getByLabelText(/Task brief \/ instructions/) as HTMLTextAreaElement).value).toBe("Cut the launch footage")
    fireEvent.change(screen.getByLabelText(/Checklist/), { target: { value: "Prepare draft\nExport final" } })
    fireEvent.click(screen.getByRole("button", { name: "Create task" }))
    await waitFor(() => expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({
      assigneeId: "employee-1",
      contentItemId: "content-1",
      description: "Cut the launch footage",
      checklist: ["Prepare draft", "Export final"],
    })))
  })

  it("requires a designated video editor before a linked video task can be created", () => {
    render(<NewTaskSheet open seed={{ contentItemId: "content-1", contentItemTitle: "Product reel", title: "Edit product reel", clientId: "client-1", clientName: "Northwind", campaignName: "General / Ongoing", deadlineAt: null, contentCategory: "video", videoEditorId: null }} onOpenChange={vi.fn()} />)
    expect(screen.getByText(/No active video editor/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create task" })).toBeDisabled()
  })

  it("suggests the linked content creator while allowing a task-level override", () => {
    render(<NewTaskSheet open seed={{ contentItemId: "content-1", contentItemTitle: "Product reel", title: "Edit product reel", clientId: "client-1", clientName: "Northwind", campaignName: "General / Ongoing", deadlineAt: null, assigneeId: "employee-1" }} onOpenChange={vi.fn()} />)

    const assignee = screen.getByLabelText(/Assign to/) as HTMLSelectElement
    expect(assignee.value).toBe("employee-1")
    expect(screen.getByText(/Suggested from the content item/)).toBeInTheDocument()
    fireEvent.change(assignee, { target: { value: "admin-1" } })
    expect(assignee.value).toBe("admin-1")
  })

  it("lists a client member once when they hold multiple client roles", () => {
    mocks.clients[0].members.push({ id: "employee-1", name: "Employee One", role: "Employee" })
    render(<NewTaskSheet open seed={{ contentItemId: "content-1", contentItemTitle: "Static post", title: "Create static post", clientId: "client-1", clientName: "Northwind", campaignName: "General / Ongoing", deadlineAt: null, contentCategory: "static" }} onOpenChange={vi.fn()} />)

    expect(screen.getAllByRole("option", { name: "Employee One · Employee" })).toHaveLength(1)
  })

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
