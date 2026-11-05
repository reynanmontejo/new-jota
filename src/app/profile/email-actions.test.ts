import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), profile: vi.fn(), updateUser: vi.fn(), resend: vi.fn(), revalidate: vi.fn(), origin: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => ({ get: mocks.origin }) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({
  auth: { getUser: mocks.getUser, updateUser: mocks.updateUser, resend: mocks.resend },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
}) }))
import { requestOwnEmailChange } from "./email-actions"
const previous = { ok: false, message: "" }
const input = (email = "new@example.test", confirmation = email) => {
  const form = new FormData(); form.set("email", email); form.set("confirmEmail", confirmation)
  form.set("redirectTo", "https://untrusted.example/")
  return form
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.origin.mockReturnValue("https://jota.example")
  mocks.getUser.mockResolvedValue({ data: { user: { id: "own-user", email: "old@example.test" } }, error: null })
  mocks.profile.mockResolvedValue({ data: { status: "active", deactivated_at: null, timezone: null }, error: null })
  mocks.updateUser.mockResolvedValue({ data: { user: { email: "old@example.test", new_email: "new@example.test" } }, error: null })
  mocks.resend.mockResolvedValue({ data: { user: null }, error: null })
})
describe("verified email requests", () => {
  it("requests Auth verification with a fixed same-origin callback and never writes the profile email", async () => {
    expect(await requestOwnEmailChange(previous, input())).toEqual(expect.objectContaining({ ok: true }))
    expect(mocks.updateUser).toHaveBeenCalledWith({ email: "new@example.test" }, { emailRedirectTo: "https://jota.example/auth/callback?next=%2Fprofile" })
    expect(mocks.revalidate).toHaveBeenCalledWith("/profile")
  })
  it("validates matching emails, unchanged address and inactive/absent authentication before sending", async () => {
    expect((await requestOwnEmailChange(previous, input("invalid"))).ok).toBe(false)
    expect((await requestOwnEmailChange(previous, input("new@example.test", "other@example.test"))).ok).toBe(false)
    expect((await requestOwnEmailChange(previous, input("old@example.test"))).ok).toBe(false)
    mocks.profile.mockResolvedValue({ data: { status: "inactive" } })
    expect((await requestOwnEmailChange(previous, input())).ok).toBe(false)
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect((await requestOwnEmailChange(previous, input())).ok).toBe(false)
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
  it("can resend expired links for the authenticated user's pending change", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "own-user", email: "old@example.test", new_email: "new@example.test" } }, error: null })
    expect((await requestOwnEmailChange(previous, input())).ok).toBe(true)
    expect(mocks.resend).toHaveBeenCalledWith({ type: "email_change", email: "old@example.test", options: { emailRedirectTo: "https://jota.example/auth/callback?next=%2Fprofile" } })
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
  it("handles rate limits, missing migration, network failures and an insecure origin without false success", async () => {
    mocks.updateUser.mockResolvedValue({ data: {}, error: { status: 429 } })
    expect((await requestOwnEmailChange(previous, input())).message).toContain("Too many")
    mocks.profile.mockResolvedValue({ data: null, error: { code: "42703" } })
    expect((await requestOwnEmailChange(previous, input())).message).toContain("migration")
    mocks.profile.mockRejectedValue(new Error("Network failure"))
    expect((await requestOwnEmailChange(previous, input())).ok).toBe(false)
    mocks.profile.mockResolvedValue({ data: { status: "active" }, error: null })
    mocks.origin.mockReturnValue("http://untrusted.example")
    expect((await requestOwnEmailChange(previous, input())).message).toContain("secure Jota")
    expect(mocks.updateUser).toHaveBeenCalledTimes(1)
  })
})
