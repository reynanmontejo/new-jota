import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  workflow: {
    tasks: [] as unknown[],
    clients: [] as unknown[],
    contentWorkItems: [{
      id: "content-1",
      title: "October launch graphic",
      clientId: "client-1",
      clientName: "Northwind",
      campaignName: "General / Ongoing",
      platform: "Instagram",
      format: "Graphic",
      status: "planned",
      publishAt: "2026-10-20T09:00:00.000Z",
      deadlineAt: null,
      assigneeId: "designer-1",
      assigneeName: "Designer One",
    }],
    currentUser: { id: "account-manager-1", name: "Account Manager", role: "employee" },
    updateStatus: vi.fn(),
  },
  openTask: vi.fn(),
  openNewTask: vi.fn(),
}))

vi.mock("@/features/workflow/workflow-provider", () => ({ useWorkflow: () => mocks.workflow }))
vi.mock("@/features/tasks/task-drawer", () => ({ useTaskDrawer: () => ({ openTask: mocks.openTask, openNewTask: mocks.openNewTask }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/app/tasks/actions", () => ({ trashTaskAction: vi.fn(), undoTaskTrashAction: vi.fn() }))

import { hideContentAlreadyTrackedByTasks, TaskList } from "@/features/tasks/task-list"
import { initialWorkflowState } from "@/features/workflow/mock-data"
import type { WorkflowTask } from "@/features/workflow/types"
import { trashTaskAction, undoTaskTrashAction } from "@/app/tasks/actions"

afterEach(() => {
  cleanup()
  mocks.workflow.tasks = []
  mocks.workflow.contentWorkItems = [{
    id: "content-1",
    title: "October launch graphic",
    clientId: "client-1",
    clientName: "Northwind",
    campaignName: "General / Ongoing",
    platform: "Instagram",
    format: "Graphic",
    status: "planned",
    publishAt: "2026-10-20T09:00:00.000Z",
    deadlineAt: null,
    assigneeId: "designer-1",
    assigneeName: "Designer One",
  }]
  mocks.workflow.currentUser = { id: "account-manager-1", name: "Account Manager", role: "employee" }
  vi.clearAllMocks()
})

describe("My Work calendar content", () => {
  it("shows video tasks delegated by the manager while keeping progress with the editor", () => {
    const delegatedTask = {
      ...initialWorkflowState.tasks[0],
      id: "delegated-video-task",
      title: "Edit launch reel",
      createdById: "account-manager-1",
      primaryOwner: { ...initialWorkflowState.tasks[0].primaryOwner, id: "editor-1", name: "Video Editor" },
      status: "todo" as const,
    }
    mocks.workflow.tasks = [delegatedTask]
    render(<TaskList />)
    expect(screen.getByText("Edit launch reel")).toBeInTheDocument()
  })

  it("shows RLS-visible client content even when another creator/editor is assigned", () => {
    render(<TaskList />)

    expect(screen.getByText("October launch graphic")).toBeInTheDocument()
    expect(screen.getByText(/Planned · Designer One/)).toBeInTheDocument()
  })

  it("previews three content cards and expands the remaining items on request", () => {
    const firstItem = mocks.workflow.contentWorkItems[0]
    mocks.workflow.contentWorkItems = Array.from({ length: 8 }, (_, index) => ({
      ...firstItem,
      id: `content-${index + 1}`,
      title: `Content item ${index + 1}`,
    }))

    render(<TaskList />)

    expect(screen.getByText("Content item 1")).toBeInTheDocument()
    expect(screen.getByText("Content item 3")).toBeInTheDocument()
    expect(screen.queryByText("Content item 4")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "View all 8" }))
    expect(screen.getByText("Content item 8")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Show less" }))
    expect(screen.queryByText("Content item 7")).not.toBeInTheDocument()
  })

  it("previews three team content cards for supervisors", () => {
    const firstItem = mocks.workflow.contentWorkItems[0]
    mocks.workflow.currentUser = { id: "supervisor-1", name: "Supervisor", role: "supervisor" }
    mocks.workflow.contentWorkItems = Array.from({ length: 5 }, (_, index) => ({
      ...firstItem,
      id: `team-content-${index + 1}`,
      title: `Team content ${index + 1}`,
    }))

    render(<TaskList />)

    expect(screen.getByRole("heading", { name: "Team content" })).toBeInTheDocument()
    expect(screen.getByText("Team content 3")).toBeInTheDocument()
    expect(screen.queryByText("Team content 4")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "View all 5" })).toBeInTheDocument()
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent)
    expect(headings.indexOf("Team content")).toBeLessThan(headings.indexOf("Tasks"))
  })

  it("filters team tasks and content by the selected user", () => {
    const firstItem = mocks.workflow.contentWorkItems[0]
    mocks.workflow.currentUser = { id: "supervisor-1", name: "Supervisor", role: "supervisor" }
    mocks.workflow.clients = [{ id: "client-1", name: "Northwind", members: [
      { id: "employee-1", name: "Employee One", role: "Employee" },
      { id: "employee-2", name: "Employee Two", role: "Employee" },
    ] }]
    mocks.workflow.tasks = [
      { id: "task-1", title: "One", clientId: "client-1", clientName: "Northwind", campaign: "", contentItem: "", status: "todo", priority: "medium", dueDate: "", primaryOwner: { id: "employee-1", name: "Employee One" } },
      { id: "task-2", title: "Two", clientId: "client-1", clientName: "Northwind", campaign: "", contentItem: "", status: "todo", priority: "medium", dueDate: "", primaryOwner: { id: "employee-2", name: "Employee Two" } },
    ]
    mocks.workflow.contentWorkItems = [{ ...firstItem, assigneeId: "employee-1", assigneeName: "Employee One" }]

    render(<TaskList />)

    expect(screen.getByRole("button", { name: "Filter User: All users" })).toBeInTheDocument()
    expect(screen.getByText("Two")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Filter User: All users" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Employee One" }))
    expect(screen.getByText("One")).toBeInTheDocument()
    expect(screen.queryByText("Two")).not.toBeInTheDocument()
    expect(screen.getByText("October launch graphic")).toBeInTheDocument()
  })

  it("switches to a compact table view", () => {
    render(<TaskList />)

    fireEvent.click(screen.getByRole("button", { name: "Table" }))

    expect(screen.getByRole("table", { name: "Tasks" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Owner" })).toBeInTheDocument()
  })

  it("offers quick task and review actions from the calendar-content card menu", async () => {
    render(<TaskList />)

    fireEvent.click(screen.getByRole("button", { name: "Actions for October launch graphic" }))
    expect(await screen.findByRole("menuitem", { name: "Add as task" })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Submit files for review" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Mark as published" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("menuitem", { name: "Add as task" }))
    expect(mocks.openNewTask).toHaveBeenCalledWith(expect.objectContaining({
      contentItemId: "content-1",
      contentItemTitle: "October launch graphic",
      clientId: "client-1",
    }))
  })

  it("hides content from My Work when an active linked task already tracks it", () => {
    const linkedTask = {
      id: "task-1",
      contentItemId: "content-1",
      status: "completed",
    } as WorkflowTask
    expect(hideContentAlreadyTrackedByTasks(mocks.workflow.contentWorkItems, [linkedTask])).toEqual([])
  })

  it("shows content in My Work again after its linked task is cancelled or trashed", () => {
    const cancelledTask = { id: "task-1", contentItemId: "content-1", status: "cancelled" } as WorkflowTask
    expect(hideContentAlreadyTrackedByTasks(mocks.workflow.contentWorkItems, [cancelledTask])).toHaveLength(1)
    expect(hideContentAlreadyTrackedByTasks(mocks.workflow.contentWorkItems, [])).toHaveLength(1)
  })

  it("moves a completed task to Trash and offers a short Undo action", async () => {
    mocks.workflow.tasks = [{
      id: "task-completed",
      title: "Completed task to clean up",
      description: "",
      clientId: "client-1",
      clientName: "Northwind",
      campaign: "October",
      contentItem: "General campaign work",
      contentItemId: null,
      createdById: "account-manager-1",
      priority: "medium",
      status: "completed",
      startDate: "Oct 1, 2026",
      dueDate: "Oct 2, 2026",
      dueAt: "2026-10-02T09:00:00.000Z",
      primaryOwner: { id: "account-manager-1", name: "Account Manager", initials: "AM", role: "Account Manager" },
      collaborators: [],
      checklist: [],
      comments: [],
      versions: [],
      activity: [],
    } satisfies WorkflowTask]
    vi.mocked(trashTaskAction).mockResolvedValue({ error: null })
    vi.mocked(undoTaskTrashAction).mockResolvedValue({ error: null })

    render(<TaskList />)
    fireEvent.click(screen.getByRole("button", { name: /Closed/ }))
    fireEvent.click(screen.getByRole("button", { name: "Task actions for Completed task to clean up" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move to Trash" }))

    await waitFor(() => expect(trashTaskAction).toHaveBeenCalledWith("task-completed"))
    expect(await screen.findByRole("status")).toHaveTextContent(/Undo available for 8 seconds/)
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    await waitFor(() => expect(undoTaskTrashAction).toHaveBeenCalledWith("task-completed"))
  })

})
