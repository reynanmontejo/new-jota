import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ context: vi.fn(), read: vi.fn(), generate: vi.fn(), rpc: vi.fn() }))
vi.mock("@/lib/supabase/request-context", () => ({ getWorkspaceRequestContext: mocks.context }))
vi.mock("@/lib/assistant/daily-reports", async (original) => ({ ...await original<typeof import("@/lib/assistant/daily-reports")>(), readReportWorkspace: mocks.read, generateReport: mocks.generate }))
import { GET, POST } from "./route"
const request = (payload: unknown) => new NextRequest("https://jota.example/api/daily-reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ userId: "me", supabase: { rpc: mocks.rpc } }); mocks.rpc.mockResolvedValue({ error: null }); mocks.read.mockResolvedValue({ date: "2026-11-05", report: { status: "draft" } }) })
describe("daily report API", () => {
  it("requires an authenticated workspace account for reads and writes", async () => {
    mocks.context.mockResolvedValue(null)
    expect((await GET(new NextRequest("https://jota.example/api/daily-reports"))).status).toBe(401)
    expect((await POST(request({ action: "save" }))).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("uses revision-checked own-report mutations and explicit submission", async () => {
    const response = await POST(request({ action: "save", date: "2026-11-05", body: "Today's work", revision: 3, authorId: "other" }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("save_daily_report_body", { p_date: "2026-11-05", p_body: "Today's work", p_expected_revision: 3 })
    expect(mocks.rpc).not.toHaveBeenCalledWith("submit_daily_report", expect.anything())
    await POST(request({ action: "send", date: "2026-11-05", recipientId: "f0000000-0000-4000-8000-000000000001", revision: 4 }))
    expect(mocks.rpc).toHaveBeenCalledWith("submit_daily_report", expect.objectContaining({ p_expected_revision: 4 }))
  })
  it("reports stale writes as conflicts and protects generated drafts against implicit replacement", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "40001" } })
    expect((await POST(request({ action: "save", date: "2026-11-05", body: "Work", revision: 1 }))).status).toBe(409)
    await POST(request({ action: "generate", date: "2026-11-05" }))
    expect(mocks.generate).toHaveBeenCalledWith(expect.anything(), "2026-11-05", undefined, undefined)
    expect((await POST(request({ action: "send", date: "2026-11-05", revision: 4 }))).status).toBe(400)
  })
})
