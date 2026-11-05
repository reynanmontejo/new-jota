import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({ actor: vi.fn(), rpc: vi.fn() }))
vi.mock("@/lib/supabase/request-context", () => ({ getWorkspaceRequestContext: mocks.actor }))
import { GET, POST } from "./route"
const request = (body: unknown, origin = "https://jota.test") => new NextRequest("https://jota.test/api/reports", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) })
const id = "a0000000-0000-4000-8000-000000000001"
beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockResolvedValue({ userId: id, organizationId: id, roles: [{ code: "account_manager" }], supabase: { rpc: mocks.rpc } }); mocks.rpc.mockResolvedValue({ data: id, error: null }) })
describe("daily report API boundaries", () => {
  it("returns bounded, recipient-scoped activity times and progress without full report notes", async () => {
    const entry = { id, activity: "Campaign graphics", start: "09:00", end: "10:00", progress: 40, nextDay: false, remarks: "Private detail in full report", sourceId: id }
    const inbox = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn().mockResolvedValue({ data: [{ id, author_name: "Mia" }], error: null }) }
    inbox.select.mockReturnValue(inbox); inbox.eq.mockReturnValue(inbox); inbox.order.mockReturnValue(inbox)
    const preview = { select: vi.fn(), eq: vi.fn(), in: vi.fn().mockResolvedValue({ data: [{ id, first: entry, second: { ...entry, progress: 100 }, more: id }], error: null }) }
    preview.select.mockReturnValue(preview); preview.eq.mockReturnValue(preview)
    const from = vi.fn(table => table === "daily_work_report_received" ? inbox : preview)
    mocks.actor.mockResolvedValue({ userId: id, organizationId: id, roles: [{ code: "supervisor" }], supabase: { rpc: mocks.rpc, from } })
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    const response = await GET(new NextRequest("https://jota.test/api/reports?kind=team"))
    expect(response.status).toBe(200)
    const { items } = await response.json()
    expect(items[0].activityPreview).toHaveLength(2)
    expect(items[0].activityPreview.map((e: { progress: number }) => e.progress)).toEqual([40, 100])
    expect(items[0].activityPreview[0]).toMatchObject({ start: "09:00", end: "10:00" })
    expect(items[0].activityPreview[0]).not.toHaveProperty("remarks")
    expect(items[0].activityPreview[0]).not.toHaveProperty("sourceId")
    expect(items[0].hasMoreActivities).toBe(true)
    expect(preview.select).toHaveBeenCalledWith("id,first:entries->0,second:entries->1,more:entries->2->id")
    expect(preview.eq).toHaveBeenCalledWith("organization_id", id)
    expect(preview.in).toHaveBeenCalledWith("id", [id])
    preview.in.mockResolvedValueOnce({ data: null, error: { code: "42501" } })
    expect((await GET(new NextRequest("https://jota.test/api/reports?kind=team"))).status).toBe(403)
  })
  it("queries received history without hiding earlier recipients behind the global latest flag", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn().mockResolvedValue({ data: [], error: null }) }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query)
    const from = vi.fn().mockReturnValue(query)
    mocks.actor.mockResolvedValue({ userId: id, organizationId: id, roles: [{ code: "supervisor" }], supabase: { rpc: mocks.rpc, from } })
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    const response = await GET(new NextRequest("https://jota.test/api/reports?kind=team"))
    expect(response.status).toBe(200)
    expect(from).toHaveBeenCalledWith("daily_work_report_received")
    expect(query.eq).toHaveBeenCalledWith("recipient_id", id)
    expect(query.eq).toHaveBeenCalledWith("organization_id", id)
    expect(query.eq).not.toHaveBeenCalledWith("is_latest", true)
  })
  it("requires active authentication and rejects cross-site mutations", async () => {
    expect((await POST(request({ action: "check", versionId: id }, "https://other.test"))).status).toBe(403)
    mocks.actor.mockResolvedValue(null)
    expect((await POST(request({ action: "check", versionId: id }))).status).toBe(401)
    expect((await GET(new NextRequest("https://jota.test/api/reports"))).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("rejects invalid fields before calling a mutation", async () => {
    const response = await POST(request({ action: "save", date: "2026-02-30", entries: [{ activity: "No valid fields" }], recipient: null, revision: 0, requestId: id }))
    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("leaves ownership to the authenticated RPC and makes retry identifiers explicit", async () => {
    const response = await POST(request({ action: "submit", reportId: id, revision: 2, requestId: id, authorId: "spoofed" }))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(mocks.rpc).toHaveBeenCalledWith("daily_work_report_submit", { p_report: id, p_revision: 2, p_request: id })
  })
  it("preserves a useful migration error and version conflict without exposing database details", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "private internals" } })
    const missing = await POST(request({ action: "check", versionId: id }))
    expect(missing.status).toBe(503)
    expect((await missing.json()).error).toContain("migrations")
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "40001" } })
    expect((await POST(request({ action: "check", versionId: id }))).status).toBe(409)
  })
  it("denies the team inbox for an ordinary employee", async () => {
    expect((await GET(new NextRequest("https://jota.test/api/reports?kind=team"))).status).toBe(403)
  })
})
