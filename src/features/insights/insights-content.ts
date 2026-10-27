export type InsightsContentItem = {
  id: string
  clientId: string
  ownerId: string | null
  format: string
  category: "static" | "video" | "other"
  status: string
  publishAt: string | null
}

export type ContentDateRange = "today" | "30" | "90" | "365" | "all"
export type ContentStatusFilter = "all" | "completed"

const manilaDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

export function isSameManilaDay(first: Date, second: Date) {
  return manilaDate.format(first) === manilaDate.format(second)
}

export function filterInsightsContent(
  items: InsightsContentItem[],
  filters: { ownerId: string; clientId: string; range: ContentDateRange; status?: ContentStatusFilter; now: Date },
) {
  const cutoff = filters.range === "all" || filters.range === "today" ? null : new Date(filters.now)
  if (cutoff) {
    cutoff.setDate(cutoff.getDate() - Number(filters.range) + 1)
    cutoff.setHours(0, 0, 0, 0)
  }

  return items.filter((item) => {
    if (filters.ownerId !== "all" && item.ownerId !== filters.ownerId) return false
    if (filters.clientId !== "all" && item.clientId !== filters.clientId) return false
    if (filters.status === "completed" && item.status !== "published") return false
    if (filters.range === "all") return true
    if (!item.publishAt) return false
    const published = new Date(item.publishAt)
    if (Number.isNaN(published.getTime())) return false
    if (filters.range === "today") return isSameManilaDay(published, filters.now)
    return cutoff !== null && published >= cutoff && published <= filters.now
  })
}

export function getContentCategoryCounts(items: InsightsContentItem[]) {
  const counts = { total: items.length, static: 0, video: 0, other: 0 }
  for (const item of items) counts[item.category] += 1
  return counts
}

export function getContentFormatBreakdown(items: InsightsContentItem[]) {
  const formats = new Map<string, { label: string; count: number }>()
  for (const item of items) {
    const label = item.format.trim() || "Unspecified"
    const key = label.toLocaleLowerCase()
    const entry = formats.get(key)
    if (entry) entry.count += 1
    else formats.set(key, { label, count: 1 })
  }
  return [...formats.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function getPublishedContentTrend(items: InsightsContentItem[], now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  return Array.from({ length: 6 }, (_, index) => {
    const periodStart = new Date(start.getFullYear(), start.getMonth() + index, 1)
    const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1)
    const count = items.filter((item) => {
      if (item.status !== "published" || !item.publishAt) return false
      const published = new Date(item.publishAt)
      return !Number.isNaN(published.getTime()) && published >= periodStart && published < periodEnd && published <= now
    }).length
    return {
      key: `${periodStart.getFullYear()}-${periodStart.getMonth() + 1}`,
      label: new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" }).format(periodStart),
      count,
    }
  })
}
