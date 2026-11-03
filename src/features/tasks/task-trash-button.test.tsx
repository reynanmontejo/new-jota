import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  trash: vi.fn(), removeTask: vi.fn(), sync: vi.fn().mockResolvedValue(true),
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() },
}))
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }))
vi.mock("@/app/tasks/actions", () => ({ trashTaskAction: mocks.trash }))
vi.mock("@/features/workflow/workflow-provider", () => ({ useWorkflow: () => ({ removeTask: mocks.removeTask, refreshWorkflowQuietly: mocks.sync }) }))
import { TaskTrashButton } from "./task-trash-button"

afterEach(() => { cleanup(); vi.clearAllMocks() })
async function confirmTrash() {
  fireEvent.click(screen.getByRole("button", { name: "Move task to Trash" }))
  fireEvent.click(screen.getByRole("button", { name: "Confirm move" }))
}

describe("Trash from task details", () => {
  it("closes the drawer after success without navigation or a page refresh", async () => {
    mocks.trash.mockResolvedValue({ error: null })
    const close = vi.fn()
    render(<TaskTrashButton taskId="task-1" onTrashed={close} />)
    await confirmTrash()
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(mocks.trash).toHaveBeenCalledWith("task-1", false)
    expect(mocks.removeTask).toHaveBeenCalledWith("task-1")
    expect(mocks.sync).toHaveBeenCalledOnce()
    expect(mocks.router.replace).not.toHaveBeenCalled()
    expect(mocks.router.push).not.toHaveBeenCalled()
    expect(mocks.router.refresh).not.toHaveBeenCalled()
  })

  it("keeps the drawer and task unchanged when authorization fails", async () => {
    mocks.trash.mockResolvedValue({ error: "permission denied" })
    const close = vi.fn()
    render(<TaskTrashButton taskId="task-1" onTrashed={close} />)
    await confirmTrash()
    expect(await screen.findByRole("alert")).toHaveTextContent("permission")
    expect(close).not.toHaveBeenCalled()
    expect(mocks.removeTask).not.toHaveBeenCalled()
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it("returns a standalone task page to the board without a second refresh", async () => {
    mocks.trash.mockResolvedValue({ error: null })
    render(<TaskTrashButton taskId="task-1" />)
    await confirmTrash()
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/tasks"))
    expect(mocks.router.refresh).not.toHaveBeenCalled()
  })

  it("shows a retryable error when the server cannot be reached", async () => {
    mocks.trash.mockRejectedValue(new Error("Network offline"))
    render(<TaskTrashButton taskId="task-1" onTrashed={vi.fn()} />)
    await confirmTrash()
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server")
    expect(mocks.removeTask).not.toHaveBeenCalled()
    expect(mocks.router.refresh).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Confirm move" })).toBeEnabled()
  })
})
