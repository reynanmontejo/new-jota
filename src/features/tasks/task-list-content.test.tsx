import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  workflow: {
    tasks: [] as unknown[],
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
vi.mock("@/app/tasks/actions", () => ({ archiveCompletedTaskAction: vi.fn(), undoTaskArchiveAction: vi.fn(), trashTaskAction: vi.fn(), undoTaskTrashAction: vi.fn() }))

import { hideContentAlreadyTrackedByTasks, TaskList } from "@/features/tasks/task-list"
import type { WorkflowTask } from "@/features/workflow/types"
import { archiveCompletedTaskAction, trashTaskAction, undoTaskArchiveAction, undoTaskTrashAction } from "@/app/tasks/actions"

afterEach(() => {
  cleanup()
  mocks.workflow.tasks = []
  vi.clearAllMocks()
})

describe("My Work calendar content", () => {
  it("shows RLS-visible client content even when another creator/editor is assigned", () => {
    render(<TaskList />)

    expect(screen.getByText("October launch graphic")).toBeInTheDocument()
    expect(screen.getByText(/Planned · Designer One/)).toBeInTheDocument()
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

  it("offers Archive for a completed task and supports Undo", async () => {
    mocks.workflow.tasks = [{
      id: "task-completed",
      title: "Completed task to archive",
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
    vi.mocked(archiveCompletedTaskAction).mockResolvedValue({ error: null })
    vi.mocked(undoTaskArchiveAction).mockResolvedValue({ error: null })

    render(<TaskList />)
    fireEvent.click(screen.getByRole("button", { name: /Closed/ }))
    fireEvent.click(screen.getByRole("button", { name: "Task actions for Completed task to archive" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move to archive" }))

    await waitFor(() => expect(archiveCompletedTaskAction).toHaveBeenCalledWith("task-completed"))
    expect(await screen.findByRole("status")).toHaveTextContent(/moved to Task archive/)
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    await waitFor(() => expect(undoTaskArchiveAction).toHaveBeenCalledWith("task-completed"))
  })
})
