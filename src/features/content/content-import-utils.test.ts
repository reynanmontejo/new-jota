import { describe, expect, it } from "vitest"

import { detectContentImportMapping, detectSocialCalendarMapping, parseContentImportCount, parseContentImportDate, parseContentImportDateOnly, readClientApprovalStatus, readContentImportStatus } from "@/features/content/content-import-utils"

describe("content import mapping", () => {
  it("maps the workbook's distinct work, deadline, and posting dates", () => {
    const mapping = detectContentImportMapping([
      "DATE",
      "DEADLINE",
      "POSTING DATE",
      "WEEK",
      "CONTENT",
      "VIDEO/GRAHPIC\nEDITOR",
    ])

    expect(mapping.workDate).toBe("0")
    expect(mapping.deadlineAt).toBe("1")
    expect(mapping.publishAt).toBe("2")
    expect(mapping.description).toBeUndefined()
    expect(mapping.title).toBeUndefined()
    expect(mapping.assignee).toBe("5")
  })

  it("does not map the reporting week to a workflow date", () => {
    expect(detectContentImportMapping(["DATE", "DEADLINE", "WEEK"]).publishAt).toBeUndefined()
  })

  it("recognizes a simple social calendar and treats its date as the planned publish date", () => {
    expect(detectSocialCalendarMapping(["Date", "Day", "Status", "Type/Focus", "Content Idea", "Format"])).toEqual({
      title: "4",
      contentType: "5",
      publishAt: "0",
      description: "3",
      notes: "2",
    })
    expect(detectSocialCalendarMapping(["Date", "Content Idea", "Format"])).toBeNull()
  })

  it("maps workbook statuses only when the destination preserves their meaning", () => {
    expect(readContentImportStatus("Not Started")).toBe("planned")
    expect(readContentImportStatus("In Progress")).toBe("in_production")
    expect(readContentImportStatus("QC Approval")).toBe("for_review")
    expect(readContentImportStatus("Waiting Client")).toBe("waiting_client")
    expect(readContentImportStatus("For Revision")).toBe("revision_requested")
    expect(readContentImportStatus("Rejected")).toBe("rejected")
  })

  it("rejects reporting week ranges as exact publish dates", () => {
    expect(parseContentImportDate("2026-08-25")?.toISOString()).toContain("2026-08-25")
    expect(parseContentImportDate("Aug 24–Aug 30, 2026")).toBeNull()
    expect(parseContentImportDate("Client request")).toBeNull()
  })

  it("maps approval, issue, revision, and comment fields", () => {
    const mapping = detectContentImportMapping(["CLIENT APPROVAL", "CLIENT ISSUES", "NO. OF REVISION", "NOTES/COMMENTS"])
    expect(mapping).toMatchObject({ clientApprovalStatus: "0", clientIssues: "1", revisionCount: "2", notes: "3" })
    expect(readClientApprovalStatus("Approved")).toBe("approved")
    expect(readClientApprovalStatus("Pending")).toBe("pending")
    expect(readClientApprovalStatus("Revision Requested")).toBe("revision_requested")
    expect(readClientApprovalStatus("Rejected")).toBe("rejected")
    expect(readClientApprovalStatus("None")).toBeNull()
  })

  it("accepts only non-negative integer revision counts and preserves date-only values", () => {
    expect(parseContentImportCount("0")).toBe(0)
    expect(parseContentImportCount("12")).toBe(12)
    expect(parseContentImportCount("1.5")).toBeNull()
    expect(parseContentImportCount("-1")).toBeNull()
    expect(parseContentImportDateOnly("2026-08-25")).toBe("2026-08-25")
  })
})
