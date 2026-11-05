import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import type { WorkspaceRequestContext } from "@/lib/supabase/request-context"
import { getReportWorkspace } from "./work-reports"

function actorWithCalendar(calendar: { timezone: string; today: string }, saved: object | null = null) {
  const rpc = vi.fn().mockImplementation(async name => ({ data: name === "daily_work_report_calendar" ? calendar : [], error: null }))
  const from = vi.fn().mockImplementation((table: string) => {
    const query = { select: vi.fn(), eq: vi.fn(), not: vi.fn(), order: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: saved, error: null }), limit: vi.fn().mockResolvedValue({ data: [], error: null }) }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.not.mockReturnValue(query); query.order.mockReturnValue(query)
    if (table === "daily_work_report_versions") query.limit.mockResolvedValue({ data: [], error: null })
    return query
  })
  return { userId: "user", organizationId: "org", supabase: { rpc, from } } as unknown as WorkspaceRequestContext
}
describe("Profile reporting calendar", () => {
  it("uses the authoritative calendar instead of the workspace or machine date", async () => {
    const actor = actorWithCalendar({ timezone: "Asia/Manila", today: "2026-11-05" })
    const result = await getReportWorkspace(actor)
    expect(result.date).toBe("2026-11-05")
    expect(result.timezone).toBe("Asia/Manila")
    expect(actor.supabase.rpc).toHaveBeenCalledWith("daily_work_report_calendar")
    expect(actor.supabase.from).not.toHaveBeenCalledWith("organizations")
  })
  it("keeps saved report zones and allows their date after a profile-zone day change", async () => {
    const actor = actorWithCalendar({ timezone: "America/Los_Angeles", today: "2026-11-04" }, { id: "report", report_date: "2026-11-05", timezone: "Asia/Manila", entries: [] })
    const result = await getReportWorkspace(actor, "2026-11-05")
    expect(result.timezone).toBe("Asia/Manila")
    expect(result.date).toBe("2026-11-05")
    expect(result.today).toBe("2026-11-04")
    expect(result.calendarTimezone).toBe("America/Los_Angeles")
  })
  it("continues to reject a new future-dated report", async () => {
    const actor = actorWithCalendar({ timezone: "Asia/Manila", today: "2026-11-05" })
    await expect(getReportWorkspace(actor, "2026-11-06")).rejects.toMatchObject({ status: 400 })
  })
})
