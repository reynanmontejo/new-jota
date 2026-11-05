import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReportVersion, ReportWorkspace, WorkReport } from "./report-model"
const navigation = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => navigation }))
import { DailyReports } from "./daily-reports"
const supervisor = "b0000000-0000-4000-8000-000000000001"
const workspace: ReportWorkspace = { date: "2026-11-05", today: "2026-11-05", timezone: "Asia/Manila", report: null, supervisors: [{ id: supervisor, display_name: "Supervisor A" }], lastRecipient: supervisor, versions: [] }
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } })
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(workspace))) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
describe("daily report editor", () => {
  it("shows each activity's time and progress plus clear checked indicators in the supervisor inbox", async () => {
    const activities = [
      { id: "entry1", activity: "Campaign graphics", start: "09:00", end: "10:00", progress: 40, nextDay: false },
      { id: "entry2", activity: "Video export", start: "23:00", end: "00:30", progress: 100, nextDay: true },
    ]
    const pending = { id: "v1", report_date: workspace.date, timezone: "Asia/Manila", author_name: "Employee One", checked_at: null, is_latest: true, activityPreview: activities, hasMoreActivities: true }
    const checked = { ...pending, id: "v2", author_name: "Employee Two", checked_at: "2026-11-05T04:00:00Z", activityPreview: [activities[0]], hasMoreActivities: false }
    vi.mocked(fetch).mockImplementation(async url => String(url).includes("kind=team") ? response({ items: [pending, checked], authors: [] }) : response(workspace))
    render(<DailyReports userId="supervisor" organizationId="org" name="Supervisor A" jobTitle={null} canReceive />)
    fireEvent.click(screen.getByRole("tab", { name: "Team reports" }))
    const row = (await screen.findByText("Employee One", { selector: "td" })).closest("tr")!
    expect(within(row).getByText("Not checked")).toBeInTheDocument()
    expect(within(row).getByText("Asia/Manila")).toBeInTheDocument()
    expect(within(row).getByText(/9:00 AM/)).toHaveTextContent("10:00 AM")
    expect(within(row).getByText(/11:00 PM/)).toHaveTextContent("12:30 AM")
    expect(within(row).getByText("+1 day")).toBeInTheDocument()
    expect(within(row).getByRole("progressbar", { name: "Employee One: Campaign graphics progress" })).toHaveAttribute("aria-valuenow", "40")
    expect(within(row).getByRole("progressbar", { name: "Employee One: Video export progress" })).toHaveAttribute("aria-valuenow", "100")
    expect(within(row).getByText("More activities in View")).toBeInTheDocument()
    expect(within(row).getByRole("button", { name: "View" })).toBeEnabled()
    const checkedRow = screen.getByText("Employee Two", { selector: "td" }).closest("tr")!
    expect(within(checkedRow).getByText("Checked")).toBeInTheDocument()
    expect(within(checkedRow).queryByText("More activities in View")).not.toBeInTheDocument()
  })
  it("offers the new Profile-calendar day without moving the opened report or fetching on focus", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-05T18:00:00Z"))
    vi.mocked(fetch).mockImplementation(async () => response({ ...workspace, timezone: "America/Los_Angeles", calendarTimezone: "Asia/Manila" }))
    render(<DailyReports userId="employee" organizationId="org" name="Mia" jobTitle={null} canReceive={false} />)
    const picker = await screen.findByLabelText("Report date")
    expect(picker).toHaveValue("2026-11-05")
    const calls = vi.mocked(fetch).mock.calls.length
    fireEvent.focus(picker)
    expect(picker).toHaveAttribute("max", "2026-11-06")
    expect(picker).toHaveValue("2026-11-05")
    expect(vi.mocked(fetch).mock.calls).toHaveLength(calls)
  })
  it("preserves inbox rows, date and employee filters during refresh", async () => {
    const version = { id: "v1", report_date: workspace.date, author_id: "employee", author_name: "Employee One", checked_at: null, is_latest: true }
    let hold = false
    let release: (value: Response) => void = () => {}
    const payload = { items: [version], authors: [{ id: "employee", display_name: "Employee One" }] }
    vi.mocked(fetch).mockImplementation(async url => {
      if (String(url).includes("kind=team")) return hold ? new Promise<Response>(resolve => { release = resolve }) : response(payload)
      return response(workspace)
    })
    render(<DailyReports userId="supervisor" organizationId="org" name="Supervisor A" jobTitle={null} canReceive />)
    fireEvent.click(screen.getByRole("tab", { name: "Team reports" }))
    await screen.findByText("Employee One", { selector: "td" })
    fireEvent.change(screen.getByLabelText("Filter date"), { target: { value: workspace.date } })
    await waitFor(() => expect(screen.getByRole("button", { name: "View" })).toBeEnabled())
    fireEvent.change(screen.getByLabelText("Filter employee"), { target: { value: "employee" } })
    await waitFor(() => expect(screen.getByRole("button", { name: "View" })).toBeEnabled())
    const row = screen.getByText("Employee One", { selector: "td" }).closest("tr")
    hold = true
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
    expect(row).toBeInTheDocument()
    expect(screen.getByLabelText("Filter date")).toHaveValue(workspace.date)
    expect(screen.getByLabelText("Filter employee")).toHaveValue("employee")
    expect(screen.getByRole("button", { name: "View" })).toBeDisabled()
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toContain("author=employee"))
    release(response(payload))
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled())
    expect(row).toBeInTheDocument()
  })
  it("shows a previous recipient's report as an earlier, read-only version", async () => {
    const version: ReportVersion = { id: "v1", report_id: "report", author_id: "employee", author_name: "Employee One", job_title: null, report_date: workspace.date, timezone: workspace.timezone, version_number: 1, entries: [{ id: supervisor, activity: "Prepared graphics", start: "09:00", end: "10:00", progress: 100, remarks: "", nextDay: false }], recipient_id: "supervisor", submitted_at: "2026-11-05T02:00:00Z", checked_at: null, checked_by: null, is_latest: false }
    vi.mocked(fetch).mockImplementation(async url => String(url).includes("kind=team") ? response({ items: [version], authors: [] }) : String(url).includes("kind=version") ? response(version) : response(workspace))
    render(<DailyReports userId="supervisor" organizationId="org" name="Supervisor A" jobTitle={null} canReceive />)
    fireEvent.click(screen.getByRole("tab", { name: "Team reports" }))
    expect(await screen.findByText("Earlier version")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "View" }))
    const dialog = await screen.findByRole("dialog", { name: "Employee One" })
    await waitFor(() => expect(within(dialog).getByText(/this received version is read-only/)).toBeInTheDocument())
    expect(within(dialog).queryByRole("button", { name: "Mark checked" })).not.toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.body)).toBe(true)
  })
  it("requires complete rows before preview and does not submit while autosaving", async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (!init?.body) return response(workspace)
      const body = JSON.parse(String(init.body))
      return response({ result: { id: "report", report_date: workspace.date, timezone: workspace.timezone, entries: body.entries, recipient_id: body.recipient, revision: 1, latest_version: 0, draft_open: true, updated_at: "now" } })
    })
    render(<DailyReports userId="employee" organizationId="org" name="Mia" jobTitle="Account Manager" canReceive={false} />)
    fireEvent.click(await screen.findByRole("button", { name: "Add activity" }))
    expect(screen.getByLabelText("Activity 1 description")).toHaveAttribute("placeholder", "Activity…")
    expect(screen.getByLabelText("Activity 1 remarks")).toHaveAttribute("placeholder", "Optional remarks")
    expect(screen.getByLabelText("Activity 1 progress")).toHaveAttribute("placeholder", "0-100")
    fireEvent.change(screen.getByLabelText("Activity 1 description"), { target: { value: "Client meeting" } })
    fireEvent.click(screen.getByRole("button", { name: "Preview & submit" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("enter both times")
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.body)).toBe(true))
    const actions = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.body).map(([, init]) => JSON.parse(String(init?.body)).action)
    expect(actions.every(action => action === "save")).toBe(true)
    expect(screen.queryByRole("tab", { name: "Team reports" })).not.toBeInTheDocument()
  })
  it("keeps submitted rows read-only and exposes correction only through report actions", async () => {
    const report: WorkReport = { id: "report", report_date: workspace.date, timezone: workspace.timezone, entries: [{ id: supervisor, activity: "Submitted graphics", start: "09:00", end: "10:00", progress: 100, remarks: "", nextDay: false }], recipient_id: supervisor, revision: 2, latest_version: 1, draft_open: false, updated_at: "now" }
    let current = report
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.body) {
        expect(JSON.parse(String(init.body))).toEqual({ action: "correct", reportId: report.id, revision: report.revision })
        current = { ...report, draft_open: true, revision: 3 }
        return response({ result: current })
      }
      return response({ ...workspace, report: current })
    })
    render(<DailyReports userId="employee" organizationId="org" name="Mia" jobTitle={null} canReceive={false} />)
    expect(await screen.findByLabelText("Activity 1 description")).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Create correction" })).not.toBeInTheDocument()
    expect(screen.queryByText("Saved")).not.toBeInTheDocument()
    expect(screen.queryByText("Asia/Manila")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add activity" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Report actions" }))
    const correction = await screen.findByRole("menuitem", { name: "Create correction" })
    expect(screen.getByRole("menuitem", { name: "Copy report" })).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.body)).toBe(true)
    fireEvent.click(correction)
    await waitFor(() => expect(screen.getByLabelText("Activity 1 description")).toBeEnabled())
    expect(screen.getByRole("button", { name: "Preview & submit" })).toBeEnabled()
  })
  it("opens preserved version history only from the report menu", async () => {
    const version: ReportVersion = { id: "v1", report_id: "report", author_id: "employee", author_name: "Mia", job_title: null, report_date: workspace.date, timezone: workspace.timezone, version_number: 1, entries: [{ id: supervisor, activity: "Prepared graphics", start: "09:00", end: "10:00", progress: 100, remarks: "", nextDay: false }], recipient_id: supervisor, submitted_at: "2026-11-05T02:00:00Z", checked_at: "2026-11-05T03:00:00Z", checked_by: supervisor, is_latest: true }
    const report: WorkReport = { id: "report", report_date: workspace.date, timezone: workspace.timezone, entries: version.entries, recipient_id: supervisor, revision: 2, latest_version: 1, draft_open: false, updated_at: "now" }
    vi.mocked(fetch).mockImplementation(async url => String(url).includes("kind=version") ? response(version) : response({ ...workspace, report, versions: [version] }))
    render(<DailyReports userId="employee" organizationId="org" name="Mia" jobTitle={null} canReceive={false} />)
    await screen.findByLabelText("Activity 1 description")
    expect(screen.queryByRole("table", { name: "Submitted versions" })).not.toBeInTheDocument()
    expect(screen.getByText("Checked")).toBeInTheDocument()
    expect(screen.getByText("Sent to Supervisor A")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Report actions" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Version history" }))
    const history = await screen.findByRole("dialog", { name: "Version history" })
    expect(within(history).getByRole("table", { name: "Submitted versions" })).toBeInTheDocument()
    fireEvent.click(within(history).getByRole("button", { name: "View" }))
    const detail = await screen.findByRole("dialog", { name: "Mia" })
    expect(within(detail).getByText("Prepared graphics")).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.body)).toBe(true)
  })
  it("lets the author select a supervisor in preview and submits only after an explicit click", async () => {
    const report: WorkReport = { id: "a0000000-0000-4000-8000-000000000001", report_date: workspace.date, timezone: workspace.timezone, entries: [{ id: "c0000000-0000-4000-8000-000000000001", activity: "Revised campaign graphics", start: "13:22", end: "14:22", progress: 23, remarks: "Waiting for feedback", nextDay: false }], recipient_id: null, revision: 1, latest_version: 0, draft_open: true, updated_at: "now" }
    let current = { ...report }
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (!init?.body) return response({ ...workspace, report: current, lastRecipient: null })
      const body = JSON.parse(String(init.body))
      if (body.action === "save") { current = { ...current, entries: body.entries, recipient_id: body.recipient, revision: current.revision + 1 }; return response({ result: current }) }
      current = { ...current, draft_open: false, latest_version: 1, revision: current.revision + 1 }
      return response({ result: "version" })
    })
    render(<DailyReports userId="employee" organizationId="org" name="Mia" jobTitle="Account Manager" canReceive={false} />)
    fireEvent.click(await screen.findByRole("button", { name: "Preview & submit" }))
    const dialog = await screen.findByRole("dialog", { name: "Preview report" })
    const preview = within(dialog)
    expect(preview.getByText("Mia")).toBeInTheDocument()
    expect(preview.getByText("Time")).toBeInTheDocument()
    expect(preview.getByText("Remarks")).toBeInTheDocument()
    expect(preview.getByText(/1:22 PM/)).toHaveTextContent("2:22 PM")
    expect(preview.getByRole("progressbar", { name: "Activity 1 progress" })).toHaveAttribute("aria-valuenow", "23")
    expect(preview.getByRole("button", { name: "Submit report" })).toBeDisabled()
    fireEvent.change(preview.getByLabelText("Supervisor"), { target: { value: supervisor } })
    await waitFor(() => expect(current.recipient_id).toBe(supervisor))
    await waitFor(() => expect(preview.getByRole("button", { name: "Submit report" })).toBeEnabled())
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.body).every(([, init]) => JSON.parse(String(init?.body)).action === "save")).toBe(true)
    fireEvent.click(preview.getByRole("button", { name: "Submit report" }))
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.body && JSON.parse(String(init.body)).action === "submit")).toBe(true))
    expect(current.recipient_id).toBe(supervisor)
  })
  it("returns from preview to the same draft without submitting", async () => {
    const report: WorkReport = { id: "report", report_date: workspace.date, timezone: workspace.timezone, entries: [{ id: supervisor, activity: "Team meeting", start: "09:00", end: "10:00", progress: 100, remarks: "", nextDay: false }], recipient_id: supervisor, revision: 1, latest_version: 0, draft_open: true, updated_at: "now" }
    vi.mocked(fetch).mockImplementation(async () => response({ ...workspace, report }))
    render(<DailyReports userId="employee" organizationId="org" name="Mia" jobTitle={null} canReceive={false} />)
    fireEvent.click(await screen.findByRole("button", { name: "Preview & submit" }))
    const dialog = await screen.findByRole("dialog", { name: "Preview report" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Back to edit" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Preview report" })).not.toBeInTheDocument())
    expect(screen.getByLabelText("Activity 1 description")).toHaveValue("Team meeting")
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.body)).toBe(true)
  })
})
