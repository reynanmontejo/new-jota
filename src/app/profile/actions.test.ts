import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), profile: vi.fn(), rpc: vi.fn(), remove: vi.fn(), revalidate: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`Redirect: ${url}`) } }))
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({
  auth: { getUser: mocks.getUser },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  rpc: mocks.rpc,
  storage: { from: () => ({ remove: mocks.remove }) },
}) }))
import { removeOwnProfilePhoto, updateOwnProfile } from "./actions"

const activeProfile = { display_name: "Reynan", job_title: "IT Admin", avatar_url: "https://database.example/storage/v1/object/public/profile-avatars/own-user/photo.jpg", status: "active", deactivated_at: null }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: "own-user" } }, error: null })
  mocks.profile.mockResolvedValue({ data: activeProfile })
  mocks.rpc.mockResolvedValue({ error: null })
  mocks.remove.mockResolvedValue({ error: null })
})

describe("profile preference saving", () => {
  const form = (timezone?: string) => {
    const data = new FormData()
    data.set("displayName", "Reynan Updated"); data.set("jobTitle", "Designer")
    if (timezone !== undefined) data.set("timezone", timezone)
    return data
  }
  it("saves personal preferences atomically without writing the avatar or shared workspace", async () => {
    await expect(updateOwnProfile(form("Asia/Kuala_Lumpur"))).rejects.toThrow("/profile?saved=1")
    expect(mocks.rpc).toHaveBeenCalledWith("update_own_profile_preferences", { p_display_name: "Reynan Updated", p_job_title: "Designer", p_timezone: "Asia/Kuala_Lumpur" })
  })
  it("retains compatibility with old forms", async () => {
    await expect(updateOwnProfile(form())).rejects.toThrow("/profile?saved=1")
    expect(mocks.rpc).toHaveBeenCalledWith("update_own_profile", expect.objectContaining({ p_avatar_url: activeProfile.avatar_url }))
  })
  it("rejects invalid zones and reports a missing migration rather than a false save", async () => {
    await expect(updateOwnProfile(form("invalid/zone"))).rejects.toThrow("/profile?error=invalid")
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ error: { code: "PGRST202" } })
    await expect(updateOwnProfile(form("UTC"))).rejects.toThrow("/profile?error=preferences-unavailable")
  })
})

describe("own profile photo removal", () => {
  it("clears only the current profile and removes its owned avatar after the RPC succeeds", async () => {
    await expect(removeOwnProfilePhoto()).rejects.toThrow("/profile?photo=removed")
    expect(mocks.rpc).toHaveBeenCalledWith("update_own_profile", { p_display_name: "Reynan", p_job_title: "IT Admin", p_avatar_url: "" })
    expect(mocks.remove).toHaveBeenCalledWith(["own-user/photo.jpg"])
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout")
  })
  it("does not delete another user's object or an external image", async () => {
    for (const avatar_url of ["https://database.example/storage/v1/object/public/profile-avatars/other-user/photo.jpg", "https://images.example/avatar.jpg", null]) {
      mocks.profile.mockResolvedValue({ data: { ...activeProfile, avatar_url } })
      await expect(removeOwnProfilePhoto()).rejects.toThrow("/profile?photo=removed")
    }
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it("preserves the old image when the profile update fails", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Unavailable" } })
    await expect(removeOwnProfilePhoto()).rejects.toThrow("/profile?photo=save-failed")
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it("retains the existing authentication and active-profile gates", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(removeOwnProfilePhoto()).rejects.toThrow("/login")
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.getUser.mockResolvedValue({ data: { user: { id: "own-user" } }, error: null })
    mocks.profile.mockResolvedValue({ data: { ...activeProfile, status: "inactive", deactivated_at: "2026-11-04" } })
    await expect(removeOwnProfilePhoto()).rejects.toThrow("/account-deactivated")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
