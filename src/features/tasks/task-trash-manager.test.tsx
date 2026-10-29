import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ manage: vi.fn(), undo: vi.fn(), refresh: vi.fn() }))
vi.mock("@/app/tasks/actions", () => ({ manageTaskTrashAction: mocks.manage, undoTaskTrashAction: mocks.undo }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
import { TaskTrashManager, type TaskTrashItem } from "./task-trash-manager"
const fresh: TaskTrashItem = { task_id: "task-1", title: "Old test assignment", client_name: "Northwind", deleted_at: "2026-10-29T00:00:00Z", ownerLabel: "Assigned to Manager", expires_at: "2099-11-29T00:00:00Z" }
const expired: TaskTrashItem = { ...fresh, task_id: "task-2", title: "Expired task", expires_at: "2020-01-01T00:00:00Z" }
beforeEach(() => { vi.clearAllMocks(); mocks.manage.mockResolvedValue({ count: 1, error: null }) })
afterEach(cleanup)

describe("Task Trash controls", () => {
  it("requires a confirmation before permanently emptying the displayed Trash", async () => {
    render(<TaskTrashManager items={[fresh]} retentionReady />)
    fireEvent.click(screen.getByRole("button", { name: "Empty now" }))
    const confirmation = screen.getByRole("dialog", { name: "Permanently delete this task?" })
    expect(confirmation).toHaveTextContent("This cannot be undone")
    expect(mocks.manage).not.toHaveBeenCalled()
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete permanently" }))
    await waitFor(() => expect(mocks.manage).toHaveBeenCalledWith(["task-1"], "delete"))
    expect(await screen.findByText("Task Trash is empty")).toBeInTheDocument()
  })
  it("restores all eligible tasks and keeps expired tasks in the list", async () => {
    render(<TaskTrashManager items={[fresh, expired]} retentionReady />)
    fireEvent.click(screen.getByRole("button", { name: "Restore all" }))
    await waitFor(() => expect(mocks.manage).toHaveBeenCalledWith(["task-1"], "restore"))
    expect(screen.queryByText(fresh.title)).not.toBeInTheDocument()
    expect(screen.getByText(expired.title)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled()
  })
  it("keeps tasks and the confirmation visible when deletion fails", async () => {
    mocks.manage.mockResolvedValue({ error: "You do not have access to manage this task." })
    render(<TaskTrashManager items={[fresh]} retentionReady />)
    fireEvent.click(screen.getByRole("button", { name: "Empty now" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }))
    const dialog = screen.getByRole("dialog")
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("do not have access")
    expect(mocks.refresh).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Keep tasks" }))
    expect(screen.getByText(fresh.title)).toBeInTheDocument()
  })
  it("keeps legacy single restore available until the migration is applied", async () => {
    mocks.undo.mockResolvedValue({ error: null })
    render(<TaskTrashManager items={[fresh]} retentionReady={false} />)
    expect(screen.getByRole("button", { name: "Empty now" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Restore all" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Restore" }))
    await waitFor(() => expect(mocks.undo).toHaveBeenCalledWith("task-1"))
  })
})
