import { describe, expect, it } from "vitest"

import { getHelpGuide, helpGuideSections, helpGuides, recommendedHelpGuideSlugs } from "@/features/help/help-guides"

describe("Help guide catalog", () => {
  it("keeps guide slugs unique and related links valid", () => {
    const slugs = helpGuides.map((guide) => guide.slug)
    expect(new Set(slugs).size).toBe(slugs.length)

    for (const guide of helpGuides) {
      expect(helpGuideSections).toContain(guide.section)
      expect(guide.steps.length).toBeGreaterThan(0)
      for (const relatedSlug of guide.related) expect(getHelpGuide(relatedSlug)).toBeDefined()
      for (const action of guide.actions) expect(action.href).toMatch(/^\//)
    }
  })

  it("clearly distinguishes content, assigned tasks, review, completion, and publishing", () => {
    const guide = getHelpGuide("how-jota-fits-together")
    expect(guide?.steps.map((step) => step.title)).toEqual(expect.arrayContaining([
      "Put planned posts in Content",
      "Use Tasks for assigned work",
      "Keep the outcomes separate",
    ]))
  })

  it("documents the client-to-task workflow and external client approval boundary", () => {
    const guide = getHelpGuide("create-work-from-client-to-task")
    expect(recommendedHelpGuideSlugs).toContain(guide?.slug)
    expect(guide?.steps.map((step) => step.title)).toEqual([
      "Create or open the client",
      "Choose the client's Video Editor",
      "Decide whether a campaign is needed",
      "Plan a static or video content item",
      "Link a production task when useful",
      "Submit the right files for internal review",
      "Send approved content to the client externally",
      "Record the client's decision",
      "Schedule, publish, and finish separately",
      "Know who owns each handoff",
    ])
    const text = guide?.steps.map((step) => step.body).join(" ") ?? ""
    expect(text).toContain("Add client")
    expect(text).toContain("General / Ongoing")
    expect(text).toContain("More details")
    expect(text).toContain("Waiting for client")
    expect(text).toContain("To do")
    expect(text).toContain("Published")
    expect(text).toContain("Supervisor or Administrator")
    expect(text).toContain("Account Manager normally owns client communication")
    expect(text).toContain("Supervisor or Administrator can handle that step")
    expect(text).toContain("assigned creator or editor")
    expect(guide?.remember).toContain("separate records")
  })

  it("does not tell employee task owners to self-complete approved work", () => {
    expect(getHelpGuide("task-board-basics")?.remember).toContain("Supervisor or Administrator")
    expect(getHelpGuide("publish-content")?.steps.at(-1)?.body).toContain("Supervisor or Administrator")
  })
})
