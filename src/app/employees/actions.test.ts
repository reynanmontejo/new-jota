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

import { createEmployee, permanentlyDeleteEmployee } from "./actions"

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

describe("permanent deletion from Employee Trash", () => {
  const employeeId = "50000000-0000-4000-8000-000000000002"
  function deletionForm(id = employeeId) {
    const form = new FormData()
    form.set("employeeId", id)
    form.set("confirmationEmail", "employee@example.com")
    return form
  }
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockResolvedValue({ actorId: "admin-1", organizationId: "organization-1" })
    mocks.createClient.mockReturnValue({ rpc: mocks.rpc })
    mocks.rpc.mockResolvedValue({ error: null })
  })
  it("requires a valid ID and confirmation email before reaching the database", async () => {
    await expect(permanentlyDeleteEmployee(deletionForm("bad-id"))).rejects.toThrow("notice=invalid")
    const form = deletionForm()
    form.delete("confirmationEmail")
    await expect(permanentlyDeleteEmployee(form)).rejects.toThrow("notice=invalid")
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it("requires employee-deletion permission", async () => {
    mocks.access.mockResolvedValue(null)
    await expect(permanentlyDeleteEmployee(deletionForm())).rejects.toThrow("notice=protected")
    expect(mocks.access).toHaveBeenCalledWith("employees.delete")
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it("rejects self-deletion before calling the service RPC", async () => {
    mocks.access.mockResolvedValue({ actorId: employeeId, organizationId: "organization-1" })
    await expect(permanentlyDeleteEmployee(deletionForm())).rejects.toThrow("notice=protected")
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it.each([
    ["PGRST202", "purge_setup"], ["42501", "protected"], ["22023", "confirmation"],
    ["55000", "not_in_trash"], ["P0001", "purge_failed"],
  ])("reports %s without claiming deletion succeeded", async (code, notice) => {
    mocks.rpc.mockResolvedValue({ error: { code } })
    await expect(permanentlyDeleteEmployee(deletionForm())).rejects.toThrow(`notice=${notice}`)
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it("uses the atomic database purge and refreshes the employee list after success", async () => {
    await expect(permanentlyDeleteEmployee(deletionForm())).rejects.toThrow("notice=purged")
    expect(mocks.rpc).toHaveBeenCalledWith("admin_permanently_delete_employee", {
      p_actor_id: "admin-1", p_employee_id: employeeId, p_confirmation_email: "employee@example.com",
    })
    expect(mocks.revalidate).toHaveBeenCalledWith("/employees")
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })
})
