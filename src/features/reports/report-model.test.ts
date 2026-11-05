import { describe, expect, it } from "vitest"
import { entryErrors, newReportEntry, overlappingEntries, reportDate, reportEntrySchema, reportText, suggestionText, validReportDate } from "./report-model"

describe("daily work report rules", () => {
  it.each([
    ["CONTENT_EXTERNAL_CLIENT_DECISION_RECORDED", "Recorded client decision"],
    ["CONTENT_CHANGES_REQUESTED", "Reviewed content and requested revisions"],
    ["CONTENT_SENT_TO_CLIENT", "Sent content to client"],
  ])("labels the recorded action %s accurately", (action, label) => {
    expect(suggestionText({ id: "event", entity_id: "content", entity_type: "content_item", action, title: "Campaign graphics", occurred_at: "2026-11-05T01:00:00Z" })).toBe(`${label}: Campaign graphics`)
  })
  it("keeps the workspace date across UTC midnight and validates real dates", () => {
    expect(reportDate("Asia/Manila", new Date("2026-11-04T18:00:00Z"))).toBe("2026-11-05")
    expect(validReportDate("2026-02-30")).toBe(false)
    expect(validReportDate("2026-11-05")).toBe(true)
  })
  it("allows incomplete drafts but requires fields and valid overnight times before submission", () => {
    const entry = newReportEntry()
    expect(reportEntrySchema.safeParse(entry).success).toBe(true)
    expect(entryErrors([entry])).toHaveLength(3)
    const overnight = { ...entry, activity: "Server maintenance", start: "23:00", end: "01:00", progress: 80 }
    expect(entryErrors([overnight])).toContain("Row 1: check the time range.")
    expect(entryErrors([{ ...overnight, nextDay: true }])).toEqual([])
    expect(reportEntrySchema.safeParse({ ...entry, progress: 101 }).success).toBe(false)
  })
  it("detects overlap without conflating separate work sessions", () => {
    const a = { ...newReportEntry(), start: "09:00", end: "10:00" }
    const b = { ...newReportEntry(), start: "09:30", end: "11:00" }
    expect(overlappingEntries([a, b])).toEqual(["Rows 1 and 2 overlap."])
    expect(overlappingEntries([a, { ...b, start: "10:00" }])).toEqual([])
  })
  it("describes review work accurately and leaves times/progress for the user", () => {
    expect(suggestionText({ id: "event", entity_id: "task", entity_type: "task", action: "TASK_REVIEW_APPROVED", title: "Video cut", occurred_at: "2026-11-05T01:00:00Z" })).toBe("Reviewed and approved: Video cut")
    expect(reportText("Mia", "2026-11-05", "Asia/Manila", [{ ...newReportEntry(), activity: "Reviewed first cut", start: "09:00", end: "09:30", progress: 100 }])).toContain("09:00 – 09:30 | Reviewed first cut | 100%")
  })
})
