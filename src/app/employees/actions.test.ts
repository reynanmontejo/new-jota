import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  access: vi.fn(), createClient: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(),
}))
vi.mock("@/lib/supabase/employee-admin", () => ({ getEmployeeManagementContext: mocks.access }))
vi.mock("@/lib/env", () => ({ getServerSupabaseEnv: () => ({ url: "https://database.example", serviceRoleKey: "test-service-key" }) }))
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("next/navigation", () => ({ redirect: (destination: string) => { throw new Error(`Redirect: ${destination}`) } }))

import { createEmployee } from "./actions"

function employeeForm(confirmation: string | null = "Example!Password") {
  const form = new FormData()
  for (const [name, value] of Object.entries({ displayName: "Test Employee", email: "employee@example.com", jobTitle: "Designer", roleCode: "account_manager", password: "Example!Password" })) form.set(name, value)
  if (confirmation !== null) form.set("confirmPassword", confirmation)
  return form
}

describe("employee creation password confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue({ actorId: "admin-1", organizationId: "organization-1" })
    mocks.createClient.mockReturnValue({ auth: { admin: { createUser: mocks.createUser, deleteUser: mocks.deleteUser } }, rpc: mocks.rpc })
    mocks.createUser.mockResolvedValue({ data: { user: { id: "employee-1" } }, error: null })
    mocks.rpc.mockResolvedValue({ error: null })
  })
  afterEach(() => vi.restoreAllMocks())

  it("rejects mismatched passwords before creating an auth account", async () => {
    await expect(createEmployee(employeeForm("Different!Password"))).rejects.toThrow("/employees?notice=password_mismatch")
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it("rejects missing confirmation even when client validation is bypassed", async () => {
    await expect(createEmployee(employeeForm(null))).rejects.toThrow("/employees?notice=invalid")
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it("creates an account with matching passwords without storing the confirmation", async () => {
    const form = employeeForm("  Example!Password  ")
    form.set("password", "  Example!Password  ")
    await expect(createEmployee(form)).rejects.toThrow("/employees?notice=created")
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: "employee@example.com", password: "  Example!Password  ", email_confirm: true,
      user_metadata: { display_name: "Test Employee" },
    })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_provision_employee", expect.objectContaining({ p_user_id: "employee-1", p_actor_id: "admin-1" }))
    expect(mocks.revalidate).toHaveBeenCalledWith("/employees")
  })

  it("retains employee-creation authorization", async () => {
    mocks.access.mockResolvedValue(null)
    await expect(createEmployee(employeeForm())).rejects.toThrow("/access-denied")
    expect(mocks.access).toHaveBeenCalledWith("employees.create")
    expect(mocks.createUser).not.toHaveBeenCalled()
  })
})
