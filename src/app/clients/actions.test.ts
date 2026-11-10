import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({ permissions: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), client: vi.fn() }))
vi.mock("@/lib/supabase/client-admin", () => ({ getClientLifecyclePermissions: mocks.permissions, getClientManagementContext: vi.fn(), getClientAssignmentContext: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
import { permanentlyDeleteClientFromTrash } from "./actions"
const id = "a0000000-0000-4000-8000-000000000001"
function form(clientId = id, name = "Example client") { const data = new FormData(); data.set("clientId", clientId); data.set("confirmationName", name); return data }
beforeEach(() => { vi.clearAllMocks(); mocks.permissions.mockResolvedValue({ canPermanentlyDelete: true }); mocks.client.mockResolvedValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ error: null, data: true }) })
describe("permanent client deletion action", () => {
  it("rejects missing administrator authorization and invalid confirmation fields", async () => {
    mocks.permissions.mockResolvedValueOnce({ canManageTrash: true, canPermanentlyDelete: false })
    expect(await permanentlyDeleteClientFromTrash({}, form())).toHaveProperty("error")
    expect(await permanentlyDeleteClientFromTrash({}, form("not-a-uuid"))).toHaveProperty("error")
    expect(await permanentlyDeleteClientFromTrash({}, form(id, " "))).toHaveProperty("error")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("uses the authenticated RPC and revalidates affected pages only after success", async () => {
    expect(await permanentlyDeleteClientFromTrash({}, form())).toEqual({ deleted: true })
    expect(mocks.rpc).toHaveBeenCalledWith("permanently_delete_client_from_trash", { p_client_id: id, p_confirmation_name: "Example client" })
    expect(mocks.revalidate).toHaveBeenCalledWith("/clients")
    expect(mocks.revalidate).toHaveBeenCalledWith("/tasks")
    expect(mocks.revalidate).not.toHaveBeenCalledWith("/", "layout")
  })
  it.each([
    ["PGRST202", "migration"], ["42501", "permission"], ["22023", "name must match"],
    ["P0002", "no longer in Trash"], ["23503", "Nothing was deleted"], ["23001", "Nothing was deleted"], ["XX000", "Nothing was deleted"],
  ])("maps %s without exposing database internals", async (code, message) => {
    mocks.rpc.mockResolvedValue({ error: { code, message: "Private database details" } })
    const result = await permanentlyDeleteClientFromTrash({}, form())
    expect(result.error).toContain(message)
    expect(result.error).not.toContain("Private database details")
    expect(result.deleted).not.toBe(true)
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
