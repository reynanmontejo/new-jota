import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ getActor: vi.fn(), driveStatus: vi.fn() }))
vi.mock("@/lib/storage/authorization", () => ({ getStorageActor: mocks.getActor, hasStoragePermission: async () => true }))
vi.mock("@/lib/storage/google-drive", () => ({ getGoogleDriveStatus: mocks.driveStatus }))
import { GET } from "./route"
const directFile = { id: "direct-file", content_item_id: "content-1", task_id: null }
const taskFile = { id: "task-file", content_item_id: null, task_id: "linked-task-1" }

function setup(content: object | null = { id: "content-1", client_handoff_version_id: "version-1" }) {
  let attachmentQuery = 0
  const filters: Array<[string, string, string, unknown]> = []
  const from = vi.fn((table: string) => {
    const result = table === "attachments" ? { data: attachmentQuery++ === 0 ? [directFile] : [taskFile, directFile], error: null }
      : table === "clients" ? { data: { id: "client-1" }, error: null }
        : table === "content_items" ? { data: content, error: null }
          : { data: [{ attachment_id: "task-file" }, { attachment_id: "direct-file" }], error: null }
    const query = {
      select: () => query,
      eq: (field: string, value: unknown) => { filters.push([table, "eq", field, value]); return query },
      in: (field: string, value: unknown) => { filters.push([table, "in", field, value]); return query },
      is: () => query, order: () => query,
      maybeSingle: async () => result,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }
    return query
  })
  mocks.getActor.mockResolvedValue({ userId: "manager-1", organizationId: "org-1", supabase: { from } })
  return { filters, from }
}

beforeEach(() => { vi.clearAllMocks(); mocks.driveStatus.mockResolvedValue({ connected: false }) })

describe("reviewed linked-task files on a content card", () => {
  it("includes the exact reviewed snapshot without duplicating files or dropping client scope", async () => {
    const { filters } = setup()
    const response = await GET(new NextRequest("https://jota.test/api/files?clientId=client-1&contentItemId=content-1"))
    expect(response.status).toBe(200)
    expect((await response.json()).files).toEqual([directFile, taskFile])
    expect(filters).toContainEqual(["content_submission_version_files", "eq", "submission_version_id", "version-1"])
    expect(filters).toContainEqual(["attachments", "eq", "client_id", "client-1"])
  })

  it("does not read snapshot files for inaccessible content", async () => {
    const { from } = setup(null)
    const response = await GET(new NextRequest("https://jota.test/api/files?clientId=client-1&contentItemId=hidden-content"))
    expect(response.status).toBe(404)
    expect(from).not.toHaveBeenCalledWith("content_submission_version_files")
  })
})
