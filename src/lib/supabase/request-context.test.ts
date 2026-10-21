import { beforeEach, describe, expect, it, vi } from "vitest"

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))

vi.mock("@/lib/supabase/server", () => ({ createClient }))

import { getWorkspaceRequestContext } from "@/lib/supabase/request-context"

const profile = {
  id: "user-1",
  organization_id: "org-1",
  display_name: "Account Manager",
  job_title: "Manager",
  avatar_url: null,
  status: "active",
  deactivated_at: null,
}

function mockClient(memberships: Array<{ organization_id: string; role_id: string; role: { id: string; code: string; name: string } | null }>, profileRow: typeof profile | null = profile) {
  const from = vi.fn((table: string) => {
    if (table === "profiles") return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profileRow, error: null }) }) }),
    }
    if (table === "user_roles") return {
      select: (columns: string) => {
        expect(columns).toContain("roles!user_roles_organization_id_role_id_fkey")
        return { eq: async () => ({ data: memberships, error: null }) }
      },
    }
    throw new Error(`Unexpected query: ${table}`)
  })
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from,
  }
  createClient.mockResolvedValue(supabase)
  return { from, supabase }
}

describe("workspace request context", () => {
  beforeEach(() => createClient.mockReset())

  it("loads the user's role with memberships without a second roles request", async () => {
    const { from } = mockClient([
      { organization_id: "org-2", role_id: "other-role", role: { id: "other-role", code: "administrator", name: "Administrator" } },
      { organization_id: "org-1", role_id: "manager-role", role: { id: "manager-role", code: "employee", name: "Employee" } },
    ])

    const context = await getWorkspaceRequestContext()

    expect(context?.organizationId).toBe("org-1")
    expect(context?.roleIds).toEqual(["manager-role"])
    expect(context?.roles).toEqual([{ id: "manager-role", code: "employee", name: "Employee" }])
    expect(from.mock.calls.map(([table]) => table)).toEqual(["profiles", "user_roles"])
  })

  it("rejects an inactive profile", async () => {
    mockClient([
      { organization_id: "org-1", role_id: "manager-role", role: { id: "manager-role", code: "employee", name: "Employee" } },
    ], { ...profile, status: "inactive" })

    expect(await getWorkspaceRequestContext()).toBeNull()
  })

  it("rejects memberships whose role is not visible", async () => {
    mockClient([{ organization_id: "org-1", role_id: "manager-role", role: null }])

    expect(await getWorkspaceRequestContext()).toBeNull()
  })
})
