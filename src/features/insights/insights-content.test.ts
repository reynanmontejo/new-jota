import { describe, expect, it } from "vitest"

import { filterInsightsContent, getContentCategoryCounts, getContentFormatBreakdown, getPublishedContentTrend, type InsightsContentItem } from "@/features/insights/insights-content"

const now = new Date(2026, 9, 22, 12)
const items: InsightsContentItem[] = [
  { id: "published-video", clientId: "a", ownerId: "one", format: "Reel", category: "video", status: "published", publishAt: "2026-10-20T08:00:00Z" },
  { id: "planned-static", clientId: "a", ownerId: "two", format: "Carousel", category: "static", status: "planned", publishAt: "2026-10-21T08:00:00Z" },
  { id: "undated-other", clientId: "b", ownerId: "one", format: "Story", category: "other", status: "published", publishAt: null },
  { id: "future-video", clientId: "b", ownerId: "two", format: "Reel", category: "video", status: "scheduled", publishAt: "2026-11-01T08:00:00Z" },
  { id: "old-static", clientId: "a", ownerId: "one", format: "Graphic", category: "static", status: "published", publishAt: "2026-06-01T08:00:00Z" },
]

describe("content reporting", () => {
  it("reconciles category counts with all underlying records, including ambiguous formats", () => {
    expect(getContentCategoryCounts(items)).toEqual({ total: 5, static: 2, video: 2, other: 1 })
    expect(getContentFormatBreakdown(items).map((entry) => [entry.label, entry.count])).toEqual([
      ["Reel", 2], ["Carousel", 1], ["Graphic", 1], ["Story", 1],
    ])
  })

  it("applies owner, client and publish-date filters without counting undated or future items in a past range", () => {
    expect(filterInsightsContent(items, { ownerId: "one", clientId: "all", range: "all", now }).map((item) => item.id))
      .toEqual(["published-video", "undated-other", "old-static"])
    expect(filterInsightsContent(items, { ownerId: "all", clientId: "a", range: "30", now }).map((item) => item.id))
      .toEqual(["published-video", "planned-static"])
    expect(getContentCategoryCounts(filterInsightsContent(items, { ownerId: "one", clientId: "a", range: "30", now })))
      .toEqual({ total: 1, static: 0, video: 1, other: 0 })
  })

  it("shows only published content when completed is selected", () => {
    const completed = filterInsightsContent(items, { ownerId: "all", clientId: "all", range: "all", status: "completed", now })
    expect(completed.map((item) => item.id)).toEqual(["published-video", "undated-other", "old-static"])
    expect(getContentCategoryCounts(completed)).toEqual({ total: 3, static: 1, video: 1, other: 1 })
  })

  it("includes the full current publish day in the workspace timezone", () => {
    const now = new Date("2026-10-21T17:00:00.000Z") // Oct 22, 1 AM in Manila
    const dated = [
      { ...items[0], id: "before", publishAt: "2026-10-21T15:59:59.000Z" },
      { ...items[0], id: "start", publishAt: "2026-10-21T16:00:00.000Z" },
      { ...items[0], id: "later-today", publishAt: "2026-10-22T15:59:59.000Z" },
      { ...items[0], id: "tomorrow", publishAt: "2026-10-22T16:00:00.000Z" },
      { ...items[0], id: "undated", publishAt: null },
    ]

    expect(filterInsightsContent(dated, { ownerId: "all", clientId: "all", range: "today", now }).map((item) => item.id))
      .toEqual(["start", "later-today"])
  })

  it("charts published output only when a publish date exists", () => {
    const trend = getPublishedContentTrend(items, now)
    expect(trend).toHaveLength(6)
    expect(trend.reduce((sum, month) => sum + month.count, 0)).toBe(2)
    expect(trend.at(-1)?.count).toBe(1)
  })
})
