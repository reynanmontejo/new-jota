import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ContentCalendar } from "@/features/calendar/content-calendar"

vi.mock("@/features/tasks/task-drawer", () => ({ useTaskDrawer: () => ({ openTask: vi.fn() }) }))
vi.mock("@/features/workflow/workflow-provider", () => ({
  useWorkflow: () => ({ tasks: [], currentUser: { id: "maria", role: "employee" } }),
}))

afterEach(cleanup)

describe("ContentCalendar", () => {
  it("opens scheduled content details when its date is selected", () => {
    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    const month = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(today)
    const dateLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`))

    render(<ContentCalendar contentPosts={[{
      id: "scheduled-post",
      date,
      title: "October launch carousel",
      clientId: "northwind-coffee",
      client: "Northwind Coffee",
      channel: "Instagram",
      contentType: "Carousel",
      status: "scheduled",
      description: "Show the seasonal menu.",
      nextAction: "Confirm final artwork",
      revisionNotes: "Use the approved brand colors.",
    }]} />)

    const dateButton = screen.getByRole("button", { name: `View details for ${month} ${today.getDate()}` })
    expect(dateButton).toHaveClass("absolute", "inset-0")
    fireEvent.click(dateButton)

    expect(dateButton).toHaveAttribute("aria-pressed", "true")
    const details = screen.getByRole("region", { name: `Details for ${dateLabel}` })
    expect(details).toHaveTextContent("October launch carousel")
    expect(details).toHaveTextContent("Northwind Coffee · Instagram · Carousel")
    expect(details).toHaveTextContent("Show the seasonal menu.")
    expect(details).toHaveTextContent("Confirm final artwork")
    expect(details).toHaveTextContent("Use the approved brand colors.")

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("region", { name: `Details for ${dateLabel}` })).not.toBeInTheDocument()
  })
})
