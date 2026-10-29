import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ContentReportingSummary } from "./insights-dashboard"
import type { InsightsContentItem } from "./insights-content"
afterEach(cleanup)
const items: InsightsContentItem[] = [
  { id: "static-1", clientId: "client-1", ownerId: "manager-1", format: "Carousel", category: "static", status: "published", publishAt: "2026-10-20T08:00:00Z" },
  { id: "video-1", clientId: "client-1", ownerId: "manager-1", format: "Reel", category: "video", status: "published", publishAt: "2026-10-20T08:00:00Z" },
  { id: "other-1", clientId: "client-1", ownerId: "manager-1", format: "Story", category: "other", status: "planned", publishAt: null },
]
function summary(data = items) {
  return <ContentReportingSummary items={data} loading={false} error={null} demoMode={false} range="all" onRangeChange={vi.fn()} status="all" onStatusChange={vi.fn()} clientId="all" onClientChange={vi.fn()} clients={[]} now={new Date("2026-10-29T08:00:00Z")} />
}
describe("compact content reporting summary", () => {
  it("filters the breakdown and trend while preserving the scope's category totals", () => {
    render(summary())
    fireEvent.click(screen.getByRole("button", { name: "Filter by video, 1 content" }))
    expect(screen.getByRole("img", { name: "0 static, 1 video, 0 other; 1 total" })).toBeInTheDocument()
    const formats = screen.getByRole("heading", { name: "Saved formats" }).parentElement!
    expect(within(formats).getByText("Reel")).toBeInTheDocument()
    expect(within(formats).queryByText("Carousel")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "All categories, 3 total content" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Filter by static, 1 content" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: /Published content trend/ })).toHaveAccessibleName(/Oct 26 1/)
    fireEvent.click(screen.getByRole("button", { name: "Clear category filter" }))
    expect(screen.getByRole("img", { name: "1 static, 1 video, 1 other; 3 total" })).toBeInTheDocument()
  })
  it("keeps an empty category filter recoverable when the outer filters change", () => {
    const { rerender } = render(summary())
    fireEvent.click(screen.getByRole("button", { name: "Filter by video, 1 content" }))
    rerender(summary([items[0]]))
    expect(screen.getByText("No content matches these filters.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "All categories, 1 total content" }))
    expect(screen.getByRole("img", { name: "1 static, 0 video, 0 other; 1 total" })).toBeInTheDocument()
  })
})
