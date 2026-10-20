import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ContentCalendar, filterContentByOwner, getCalendarDayPreview, getDeadlineUrgency } from "@/features/calendar/content-calendar"

vi.mock("@/features/tasks/task-drawer", () => ({ useTaskDrawer: () => ({ openTask: vi.fn() }) }))
vi.mock("@/features/workflow/workflow-provider", () => ({
  useWorkflow: () => ({ tasks: [], currentUser: { id: "maria", role: "employee" } }),
}))

afterEach(cleanup)

describe("calendar content owner filter", () => {
  const posts = [
    { id: "mine", date: "2026-10-13", title: "Mine", clientId: "client", client: "Client", channel: "Instagram", ownerId: "supervisor" },
    { id: "employee", date: "2026-10-13", title: "Employee", clientId: "client", client: "Client", channel: "Instagram", ownerId: "employee-1" },
    { id: "unassigned", date: "2026-10-13", title: "Unassigned", clientId: "client", client: "Client", channel: "Instagram", ownerId: null },
  ]

  it("supports all, supervisor-only, and individual employee views", () => {
    expect(filterContentByOwner(posts, "all", "supervisor")).toHaveLength(3)
    expect(filterContentByOwner(posts, "mine", "supervisor").map((post) => post.id)).toEqual(["mine"])
    expect(filterContentByOwner(posts, "employee-1", "supervisor").map((post) => post.id)).toEqual(["employee"])
  })
})

describe("calendar deadline urgency", () => {
  it("classifies past, near, and later deadlines", () => {
    expect(getDeadlineUrgency("2026-10-14", "2026-10-15")).toBe("overdue")
    expect(getDeadlineUrgency("2026-10-18", "2026-10-15")).toBe("soon")
    expect(getDeadlineUrgency("2026-10-19", "2026-10-15")).toBe("upcoming")
  })
})

describe("calendar day preview", () => {
  it("shows a bounded preview and reports the number of additional items", () => {
    expect(getCalendarDayPreview(["content-1", "content-2", "task-1", "task-2"])).toEqual({
      visibleEvents: ["content-1", "content-2"],
      remainingCount: 2,
    })
  })
})

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
    expect(details.parentElement).toHaveClass("lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]")
    expect(details).toHaveTextContent("October launch carousel")
    expect(details).toHaveTextContent("Northwind Coffee · Instagram · Carousel")
    expect(details).toHaveTextContent("Show the seasonal menu.")
    expect(details).toHaveTextContent("Confirm final artwork")
    expect(details).toHaveTextContent("Use the approved brand colors.")

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("region", { name: `Details for ${dateLabel}` })).not.toBeInTheDocument()
  })

  it("shows a view-more control for crowded days and supports minimizing the side details", () => {
    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    const dateLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`))
    const post = (id: string, title: string) => ({ id, date, title, clientId: "client", client: "Client", channel: "Instagram" })

    render(<ContentCalendar contentPosts={[
      post("post-1", "First post"),
      post("post-2", "Second post"),
      post("post-3", "Third post"),
      post("post-4", "Fourth post"),
    ]} />)

    expect(screen.getByRole("button", { name: `View 2 more items for ${date}` })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: `View 2 more items for ${date}` }))

    const details = screen.getByRole("region", { name: `Details for ${dateLabel}` })
    expect(details).toHaveTextContent("First post")
    expect(details).toHaveTextContent("Second post")
    expect(details).toHaveTextContent("Third post")
    expect(details).toHaveTextContent("Fourth post")

    fireEvent.click(screen.getByRole("button", { name: "Minimize" }))
    expect(details).toHaveClass("flex", "items-center")
    fireEvent.click(screen.getByRole("button", { name: `Expand details for ${dateLabel}` }))
    expect(details).toHaveTextContent("Fourth post")

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("region", { name: `Details for ${dateLabel}` })).not.toBeInTheDocument()
  })
})
