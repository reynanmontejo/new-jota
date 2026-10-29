import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
const { schedule } = vi.hoisted(() => ({ schedule: vi.fn() }))
vi.mock("@/app/content/actions", () => ({ scheduleClientApprovedContent: schedule }))
import { ContentScheduleSheet } from "./content-schedule-sheet"
afterEach(() => { cleanup(); vi.clearAllMocks() })
const item = { id: "content-1", title: "Launch reel", client_name: "Northwind", platform: "Instagram", publish_at: null }

describe("client-approved posting schedule", () => {
  it("saves the device's selected time as an absolute timestamp", async () => {
    schedule.mockResolvedValue({ ok: true })
    const onSaved = vi.fn()
    render(<ContentScheduleSheet item={item} onClose={vi.fn()} onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText("Posting date and time"), { target: { value: "2099-11-02T17:30" } })
    fireEvent.click(screen.getByRole("button", { name: "Save posting schedule" }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(schedule).toHaveBeenCalledWith(item.id, new Date("2099-11-02T17:30").toISOString())
  })

  it("keeps the schedule open when the server rejects a stale approval", async () => {
    schedule.mockResolvedValue({ ok: false, error: "Client approval is required for the latest version" })
    const onSaved = vi.fn()
    render(<ContentScheduleSheet item={item} onClose={vi.fn()} onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText("Posting date and time"), { target: { value: "2099-11-02T17:30" } })
    fireEvent.click(screen.getByRole("button", { name: "Save posting schedule" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("latest version")
    expect(onSaved).not.toHaveBeenCalled()
  })
})
