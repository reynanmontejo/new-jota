import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAuthenticatedAppUser: vi.fn(),
  loadWorkflowData: vi.fn(),
}))

vi.mock("@/lib/supabase/profile", () => ({ getAuthenticatedAppUser: mocks.getAuthenticatedAppUser }))
vi.mock("@/features/workflow/workflow-data", () => ({ loadWorkflowData: mocks.loadWorkflowData }))

import { GET } from "@/app/api/workflow-summary/route"

describe("workflow summary endpoint", () => {
  beforeEach(() => {
    mocks.getAuthenticatedAppUser.mockReset()
    mocks.loadWorkflowData.mockReset()
  })

  it("rejects a request without an active workspace user", async () => {
    mocks.getAuthenticatedAppUser.mockResolvedValue(null)

    const response = await GET()

    expect(response.status).toBe(401)
    expect(mocks.loadWorkflowData).not.toHaveBeenCalled()
  })

  it("returns only the authorized summary without caching", async () => {
    const summary = { tasks: [], clients: [], assignableUsers: [], upcomingContent: [], contentWorkItems: [] }
    mocks.getAuthenticatedAppUser.mockResolvedValue({ id: "user-1" })
    mocks.loadWorkflowData.mockResolvedValue(summary)

    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(await response.json()).toEqual({ summary })
  })
})
