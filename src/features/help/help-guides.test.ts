import { describe, expect, it } from "vitest"

import { getHelpGuide, helpGuideSections, helpGuides } from "@/features/help/help-guides"

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
    expect(guide?.steps.map((step) => step.title)).toContain("Choose Content or New task")
    expect(guide?.steps.map((step) => step.title)).toContain("Keep review and client decisions distinct")
    expect(guide?.remember).toContain("does not publish content")
  })
})
