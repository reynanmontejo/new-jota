import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ context: vi.fn(), read: vi.fn(), generate: vi.fn(), rpc: vi.fn(), answer: vi.fn() }))
vi.mock("@/lib/supabase/request-context", () => ({ getWorkspaceRequestContext: mocks.context }))
vi.mock("@/lib/assistant/answer", () => ({ answerAssistant: mocks.answer }))
vi.mock("@/lib/assistant/daily-reports", async (original) => ({ ...await original<typeof import("@/lib/assistant/daily-reports")>(), readReportWorkspace: mocks.read, generateReport: mocks.generate }))
import { POST } from "./route"
const id = "f0000000-0000-4000-8000-000000000001"
const request = (message: string, origin = "https://jota.example") => new NextRequest("https://jota.example/api/assistant", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ message, requestId: id, organizationId: "attacker-supplied", authorId: "someone-else" }) })
beforeEach(() => {
  vi.clearAllMocks(); mocks.context.mockResolvedValue({ userId: "current-user", organizationId: "current-org", supabase: { rpc: mocks.rpc } })
  mocks.read.mockResolvedValue({ date: "2026-11-05" }); mocks.rpc.mockResolvedValue({ error: null }); mocks.generate.mockResolvedValue("draft")
  mocks.answer.mockResolvedValue({ reply: "Open Content.", mode: "guides", sources: [] })
})
describe("assistant request boundaries", () => {
  it("rejects unauthenticated and cross-origin messages before mutations or AI", async () => {
    expect((await POST(request("Save: work", "https://other.example"))).status).toBe(403)
    mocks.context.mockResolvedValue(null)
    expect((await POST(request("Help"))).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.answer).not.toHaveBeenCalled()
  })
  it("saves an explicit update only for the authenticated actor, with a retry identifier", async () => {
    const response = await POST(request("Save: Finished the graphics."))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("save_daily_report_note", { p_date: "2026-11-05", p_body: "Finished the graphics.", p_request_id: id })
    expect((await response.json()).reply).toContain("Saved")
    expect(mocks.answer).not.toHaveBeenCalled()
  })
  it("never acknowledges a failed save and creates a draft without sending it", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "PGRST202" } })
    const failed = await POST(request("Save: Work update"))
    expect(failed.status).toBe(503)
    expect((await failed.json()).reply).toBeUndefined()
    const generated = await POST(request("Generate my daily report"))
    expect((await generated.json()).openReport).toBe(true)
    expect(mocks.generate).toHaveBeenCalledOnce()
    expect(mocks.rpc).not.toHaveBeenCalledWith("submit_daily_report", expect.anything())
  })
  it("answers questions without interpreting them as actions and rejects empty/oversized notes", async () => {
    expect((await POST(request("How do I create a task?"))).status).toBe(200)
    expect(mocks.answer).toHaveBeenCalledOnce()
    expect((await POST(request("Save:"))).status).toBe(400)
    expect((await POST(request("x".repeat(2001)))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("supports a reverse-proxied production origin using the request Host header", async () => {
    const incoming = new NextRequest("http://127.0.0.1:3000/api/assistant", { method: "POST", headers: { origin: "https://jota.example", host: "jota.example", "content-type": "application/json" }, body: JSON.stringify({ message: "Help", requestId: id }) })
    expect((await POST(incoming)).status).toBe(200)
  })
})
