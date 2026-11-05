import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const navigation = vi.hoisted(() => ({ query: "" }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(navigation.query) }))
import { FloatingAssistant } from "./floating-assistant"
import type { ReportWorkspace } from "@/lib/assistant/daily-reports"

const workspace: ReportWorkspace = { date: "2026-11-05", today: "2026-11-05", timezone: "Asia/Manila", report: null, notes: [], supervisors: [{ id: "f0000000-0000-4000-8000-000000000001", display_name: "Mika Supervisor" }], inbox: [], canReceive: false }
const response = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status })
const props = { userId: "user-1", userName: "Alex Rivera", canReceive: false }
async function openAssistant() { fireEvent.click(screen.getByRole("button", { name: "Open Jota assistant" })); await waitFor(() => expect(screen.getByLabelText("Ask Jota or save a work update")).toHaveFocus()) }
beforeEach(() => {
  navigation.query = ""
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => response(workspace)))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe("global floating assistant", () => {
  it("does not load data until opened or reload on window focus and ordinary navigation", async () => {
    const { rerender } = render(<FloatingAssistant {...props} />)
    expect(fetch).not.toHaveBeenCalled()
    await openAssistant()
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("tab", { name: "My report" }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("tab", { name: "Ask Jota" }))
    fireEvent.change(screen.getByLabelText("Ask Jota or save a work update"), { target: { value: "My unfinished question" } })
    fireEvent.focus(window)
    rerender(<FloatingAssistant {...props} />)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText("Ask Jota or save a work update")).toHaveValue("My unfinished question")
    fireEvent.click(screen.getByRole("button", { name: "Close assistant" }))
    expect(screen.getByRole("button", { name: "Open Jota assistant" })).toHaveFocus()
    await openAssistant()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it("keeps failed note text and reuses its request ID on retry without falsely claiming a save", async () => {
    let failed = true
    vi.mocked(fetch).mockImplementation(async (url) => String(url).includes("/api/assistant") ? failed ? response({ error: "Could not save this update." }, 503) : response({ reply: "Saved to your report notes.", mode: "report", reportChanged: true }) : response(workspace))
    render(<FloatingAssistant {...props} />)
    await openAssistant()
    const input = screen.getByLabelText("Ask Jota or save a work update")
    fireEvent.change(input, { target: { value: "Save: Finished graphics." } })
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled())
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save")
    expect(input).toHaveValue("Save: Finished graphics.")
    expect(screen.queryByText("Saved to your report notes.")).not.toBeInTheDocument()
    failed = false
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(await screen.findByText("Saved to your report notes.")).toBeInTheDocument()
    const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/api/assistant"))
    const first = JSON.parse(String(calls[0][1]?.body)), second = JSON.parse(String(calls[1][1]?.body))
    expect(first.requestId).toBe(second.requestId)
    expect(second.history).toHaveLength(0)
  })
  it("opens a generated draft without automatically submitting it", async () => {
    let generated = false
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes("/api/assistant")) { generated = true; return response({ reply: "Draft ready.", mode: "report", reportChanged: true, openReport: true }) }
      return response(generated ? { ...workspace, report: { id: "report-1", body: "Finished graphics.", status: "draft", revision: 2, notes_revision: 1, body_notes_revision: 1 } } : workspace)
    })
    render(<FloatingAssistant {...props} />)
    await openAssistant()
    fireEvent.change(screen.getByLabelText("Ask Jota or save a work update"), { target: { value: "Generate my daily report" } })
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled())
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))
    expect(await screen.findByLabelText("Your daily report")).toHaveValue("Finished graphics.")
    expect(screen.getByRole("button", { name: "Send to supervisor" })).toBeDisabled()
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
  })
  it("supports supervisors' own reports and opens received reports from repeated notification events", async () => {
    const data = { ...workspace, canReceive: true, inbox: [{ id: "incoming", authorName: "Jamie Employee", report_date: "2026-11-05", body: "Employee work report.", status: "submitted" }] }
    vi.mocked(fetch).mockImplementation(async () => response(data))
    render(<FloatingAssistant {...props} canReceive />)
    await openAssistant()
    fireEvent.click(screen.getByRole("tab", { name: "My report" }))
    expect(screen.queryByRole("button", { name: "Send to supervisor" })).not.toBeInTheDocument()
    expect(await screen.findByText(/share it with the CEO outside Jota/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Close assistant" }))
    await act(async () => { window.dispatchEvent(new Event("jota:open-report-inbox")) })
    expect(screen.getByRole("tab", { name: "Received" })).toHaveAttribute("aria-selected", "true")
    fireEvent.click(await screen.findByRole("button", { name: /Jamie Employee/ }))
    expect(screen.getByText("Employee work report.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument()
  })
  it("tracks the pointer without React renders and removes its listener on unmount", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query === "(pointer: fine)" })))
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1 })
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {})
    const { unmount } = render(<FloatingAssistant {...props} />)
    fireEvent(window, new MouseEvent("pointermove", { clientX: 400, clientY: 100 }))
    const face = screen.getByRole("button", { name: "Open Jota assistant" }).firstElementChild as HTMLElement
    expect(face.style.getPropertyValue("--eye-x")).not.toBe("")
    const calls = raf.mock.calls.length
    unmount()
    fireEvent(window, new MouseEvent("pointermove", { clientX: 500, clientY: 200 }))
    expect(raf).toHaveBeenCalledTimes(calls)
  })
  it("does not track pointer motion when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })))
    const raf = vi.spyOn(window, "requestAnimationFrame")
    render(<FloatingAssistant {...props} />)
    fireEvent(window, new MouseEvent("pointermove", { clientX: 400, clientY: 100 }))
    expect(raf).not.toHaveBeenCalled()
  })
})
