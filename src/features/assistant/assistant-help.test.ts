import { describe, expect, it } from "vitest"
import { assistantGuideReply, composeDailyReport, findAssistantGuides, parseReportCommand } from "./assistant-help"

describe("assistant intent and grounded guidance", () => {
  it("saves only explicit note commands and generates drafts only for clear requests", () => {
    expect(parseReportCommand("Save: Finished the website." )).toEqual({ action: "note", body: "Finished the website." })
    expect(parseReportCommand("Generate my daily report")).toEqual({ action: "generate" })
    expect(parseReportCommand("please prepare my report.")).toEqual({ action: "generate" })
    expect(parseReportCommand("How do I save a report?")).toBeNull()
    expect(parseReportCommand("Can a supervisor approve content?")).toBeNull()
  })
  it("uses existing product guides and does not invent routes or expose administrator-only guides", () => {
    expect(findAssistantGuides("import content csv")[0].slug).toBe("import-calendar-csv")
    expect(findAssistantGuides("administrator setup", false).some((guide) => guide.section === "Administrators")).toBe(false)
    expect(assistantGuideReply("daily report").sources[0].href).toBe("/help/assistant-and-daily-reports")
    expect(assistantGuideReply("unrelated obscure subject").mode).toBe("guides")
  })
  it("generates a report only from saved notes, preserving their content without fabricated accomplishments", () => {
    const result = composeDailyReport("Alex", "2026-11-05", [{ body: "Waiting for client feedback." }, { body: "Met the HR team." }])
    expect(result).toContain("Waiting for client feedback.")
    expect(result).toContain("Met the HR team.")
    expect(result).not.toMatch(/completed|approved|hours/i)
  })
})
