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
})
