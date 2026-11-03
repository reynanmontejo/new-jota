import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
import { manageTaskTrashAction, trashTaskAction, undoTaskTrashAction } from "./actions"
const taskId = "50000000-0000-4000-8000-000000000001"
beforeEach(() => vi.clearAllMocks())
describe("Task Trash server actions", () => {
  it.each([
    ["trash", trashTaskAction, "workflow_trash_task_for_current_user"],
    ["undo", undoTaskTrashAction, "workflow_restore_task_from_trash"],
  ] as const)("keeps %s in place while retaining database authorization", async (_name, action, rpc) => {
    mocks.rpc.mockResolvedValue({ error: null })
    expect(await action(taskId, false)).toEqual({ error: null })
    expect(mocks.rpc).toHaveBeenCalledWith(rpc, { p_task_id: taskId })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it("still invalidates task pages for legacy trash callers", async () => {
    mocks.rpc.mockResolvedValue({ error: null })
    await trashTaskAction(taskId)
    expect(mocks.revalidate).toHaveBeenCalledWith("/tasks/trash")
  })
  it("rejects a denied in-place trash request without revalidating", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "permission denied" } })
    expect(await trashTaskAction(taskId, false)).toEqual({ error: "permission denied" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it("rejects malformed task IDs without reaching the database", async () => {
    expect(await manageTaskTrashAction(["bad-id"], "delete")).toHaveProperty("error", "Choose valid tasks and try again.")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("preserves the list when database authorization fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } })
    expect(await manageTaskTrashAction([taskId], "delete")).toHaveProperty("error", "You do not have access to manage one or more of these tasks.")
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it("deduplicates the requested tasks and refreshes the task views after success", async () => {
    mocks.rpc.mockResolvedValue({ data: 1, error: null })
    expect(await manageTaskTrashAction([taskId, taskId], "restore")).toEqual({ count: 1, error: null })
    expect(mocks.rpc).toHaveBeenCalledWith("workflow_manage_task_trash", { p_task_ids: [taskId], p_action: "restore" })
    expect(mocks.revalidate).toHaveBeenCalledWith("/tasks/trash")
  })
})
