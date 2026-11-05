import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ exchange: vi.fn() }))
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }))
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { exchangeCodeForSession: mocks.exchange } }) }))
import { GET } from "./route"
beforeEach(() => { mocks.exchange.mockReset(); mocks.exchange.mockResolvedValue({ error: null }) })
describe("auth callback destinations", () => {
  it("returns an email confirmation to Profile and keeps normal login behavior", async () => {
    expect((await GET(new NextRequest("https://jota.example/auth/callback?code=valid&next=%2Fprofile"))).headers.get("location")).toBe("https://jota.example/profile?email=checked")
    expect((await GET(new NextRequest("https://jota.example/auth/callback?code=valid"))).headers.get("location")).toBe("https://jota.example/")
  })
  it("passes through the SDK's PKCE flow identifier for the matching browser verifier", async () => {
    await GET(new NextRequest("https://jota.example/auth/callback?code=valid&next=%2Fprofile&sb_flow_id=flow-identifier"))
    expect(mocks.exchange).toHaveBeenCalledWith("valid", { flowId: "flow-identifier" })
  })
  it("ignores untrusted return targets and reports failed/expired email links", async () => {
    expect((await GET(new NextRequest("https://jota.example/auth/callback?code=valid&next=https://untrusted.example"))).headers.get("location")).toBe("https://jota.example/")
    mocks.exchange.mockResolvedValue({ error: { message: "Expired" } })
    expect((await GET(new NextRequest("https://jota.example/auth/callback?code=expired&next=%2Fprofile"))).headers.get("location")).toBe("https://jota.example/profile?email=confirmation-failed")
  })
  it("handles the first of two secure email confirmations without reporting success or an expired link", async () => {
    const response = await GET(new NextRequest("https://jota.example/auth/callback?next=%2Fprofile&message=Confirmation%20link%20accepted.%20Please%20confirm%20the%20other%20email"))
    expect(response.headers.get("location")).toBe("https://jota.example/profile?email=pending")
    expect(mocks.exchange).not.toHaveBeenCalled()
    const failed = await GET(new NextRequest("https://jota.example/auth/callback?next=%2Fprofile&message=Confirmation%20link%20accepted.&error=expired"))
    expect(failed.headers.get("location")).toBe("https://jota.example/profile?email=confirmation-failed")
  })
})
