import { beforeEach, describe, expect, it, vi } from "vitest"

const { getWorkspaceRequestContext } = vi.hoisted(() => ({ getWorkspaceRequestContext: vi.fn() }))

vi.mock("@/lib/supabase/request-context", () => ({ getWorkspaceRequestContext }))

import { loadWorkflowData } from "@/features/workflow/workflow-data"

function mockSummaryQuery(overrides: Record<string, { data: unknown; error: { message: string } | null }> = {}) {
  const results = {
    tasks: { data: [{
      id: "task-1", title: "Edit launch video", description: null, client_id: "client-1",
      campaign_id: "campaign-1", content_item_id: "content-1", status: "todo", priority: "high",
      start_at: null, due_at: null, completed_at: null, created_by: "user-1",
      linked_content: { title: "Launch video", client_approval_status: "pending" },
      active_assignees: [
        { user_id: "user-1", is_primary: true },
        { user_id: "user-2", is_primary: false },
      ],
    }], error: null },
    clients: { data: [{
      id: "client-1", name: "Client One",
      active_campaigns: [{ id: "campaign-1", name: "Launch" }],
      active_members: [{ user_id: "user-1" }, { user_id: "user-2" }],
    }], error: null },
    content_items: { data: [], error: null },
    profiles: { data: [
      { id: "user-1", display_name: "Editor One", job_title: "Video Editor", status: "active", deactivated_at: null },
      { id: "user-2", display_name: "Manager Two", job_title: "Account Manager", status: "active", deactivated_at: null },
    ], error: null },
    ...overrides,
  }
  const filters: Array<[string, string, unknown]> = []
  const from = vi.fn((table: keyof typeof results) => {
    if (!(table in results)) throw new Error(`Unexpected query: ${table}`)
    const query = {
      select(columns: string) { filters.push([table, "select", columns]); return query },
      is(column: string, value: unknown) { filters.push([table, column, value]); return query },
      in(column: string, values: unknown) { filters.push([table, column, values]); return query },
      order() { return Promise.resolve(results[table]) },
      then: (resolve: (value: typeof results[typeof table]) => unknown) => Promise.resolve(results[table]).then(resolve),
    }
    return query
  })
  getWorkspaceRequestContext.mockResolvedValue({ supabase: { from } })
  return { from, filters }
}

describe("workflow summary loading", () => {
  beforeEach(() => getWorkspaceRequestContext.mockReset())

  it("loads linked tasks, campaigns, and participants in one query wave", async () => {
    const { from, filters } = mockSummaryQuery()

    const summary = await loadWorkflowData()

    expect(from.mock.calls.map(([table]) => table)).toEqual(["tasks", "clients", "content_items", "profiles"])
    expect(filters).toContainEqual(["tasks", "active_assignees.removed_at", null])
    expect(filters).toContainEqual(["clients", "active_campaigns.deleted_at", null])
    expect(filters).toContainEqual(["clients", "active_members.removed_at", null])
    expect(summary.clients[0].campaigns).toEqual([{ id: "campaign-1", name: "Launch" }])
    expect(summary.clients[0].members?.map(({ id }) => id)).toEqual(["user-1", "user-2"])
    expect(summary.tasks[0]).toMatchObject({
      clientName: "Client One", campaign: "Launch", contentItem: "Launch video", contentClientApproval: "pending",
      primaryOwner: { id: "user-1", name: "Editor One" },
      collaborators: [{ id: "user-2", name: "Manager Two" }],
    })
  })

  it("fails visibly when an embedded summary query fails", async () => {
    mockSummaryQuery({ tasks: { data: null, error: { message: "relationship unavailable" } } })

    await expect(loadWorkflowData()).rejects.toThrow("Could not load tasks: relationship unavailable")
  })
})
