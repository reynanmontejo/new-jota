import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { initialWorkflowState } from "@/features/workflow/mock-data"

const mocks = vi.hoisted(() => ({
  list: vi.fn(), reassign: vi.fn(), refresh: vi.fn(),
  actor: { id: "manager", name: "Manager", role: "employee" },
}))
vi.mock("@/app/tasks/actions", () => ({ listVideoTaskAssigneesAction: mocks.list, reassignVideoTaskAction: mocks.reassign }))
vi.mock("@/features/workflow/workflow-provider", () => ({ useWorkflow: () => ({
  currentUser: mocks.actor, demoMode: false, refreshWorkflowQuietly: mocks.refresh,
  clients: [{ id: "client", members: [{ id: "manager", clientRoles: ["account_manager"] }] }],
}) }))
import { TaskReassignControl } from "@/features/tasks/task-reassign-control"

afterEach(() => { cleanup(); vi.resetAllMocks(); mocks.actor = { id: "manager", name: "Manager", role: "employee" } })
const task = { ...initialWorkflowState.tasks[0], id: "task", clientId: "client", contentItemId: "content", contentCategory: "video" as const, requiresReview: true, status: "in_progress" as const, primaryOwner: { id: "editor", name: "Editor", initials: "ED", role: "Editor" } }

describe("video task reassignment", () => {
  it("keeps the original expected owner even if realtime changes the task while the form is open", async () => {
    mocks.list.mockResolvedValue({ people: [{ user_id: "backup", display_name: "Backup", job_title: "Editor" }], error: null })
    mocks.reassign.mockResolvedValue({ error: null }); mocks.refresh.mockResolvedValue(true)
    const { rerender } = render(<TaskReassignControl task={task} />)
    fireEvent.click(screen.getByRole("button", { name: "Reassign task" }))
    await screen.findByRole("option", { name: "Backup · Editor" })
    fireEvent.change(screen.getByLabelText("Reassign video producer"), { target: { value: "backup" } })
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Editor is unavailable" } })
    rerender(<TaskReassignControl task={{ ...task, primaryOwner: { ...task.primaryOwner, id: "different-editor" } }} />)
    fireEvent.click(screen.getByRole("button", { name: "Save assignment" }))
    await waitFor(() => expect(mocks.reassign).toHaveBeenCalledWith({ taskId: "task", assigneeId: "backup", expectedOwner: "editor", reason: "Editor is unavailable" }))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
    expect(await screen.findByRole("status")).toHaveTextContent("Assignment saved")
  })

  it("shows a failed assignment and keeps the form available without reporting success", async () => {
    mocks.list.mockResolvedValue({ people: [{ user_id: "backup", display_name: "Backup", job_title: null }], error: null })
    mocks.reassign.mockResolvedValue({ error: "The task owner changed. Refresh the assignment and try again" })
    render(<TaskReassignControl task={task} />)
    fireEvent.click(screen.getByRole("button", { name: "Reassign task" }))
    await screen.findByRole("option", { name: "Backup" })
    fireEvent.change(screen.getByLabelText("Reassign video producer"), { target: { value: "" } })
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Leave unassigned" } })
    fireEvent.click(screen.getByRole("button", { name: "Save assignment" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("owner changed")
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Save assignment" })).toBeEnabled()
  })

  it("does not offer reassignment to an editor, during review, or on static work", () => {
    mocks.actor = { id: "editor", name: "Editor", role: "employee" }
    const { rerender } = render(<TaskReassignControl task={task} />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    mocks.actor = { id: "manager", name: "Manager", role: "supervisor" }
    rerender(<TaskReassignControl task={{ ...task, status: "for_review" }} />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    rerender(<TaskReassignControl task={{ ...task, contentCategory: "static" }} />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
