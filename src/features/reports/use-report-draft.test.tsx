import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { newReportEntry, type ReportWorkspace } from "./report-model"
import { useReportDraft } from "./use-report-draft"

const workspace: ReportWorkspace = { date: "2026-11-05", today: "2026-11-05", timezone: "Asia/Manila", report: null, supervisors: [], lastRecipient: null, versions: [] }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal("fetch", vi.fn()) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe("report draft persistence", () => {
  it("retains valid unsaved recovery older than two hours", async () => {
    const entry = { ...newReportEntry(), activity: "Unsaved work from earlier today" }
    const key = "jota-report-recovery:org:user:2026-11-05"
    sessionStorage.setItem(key, JSON.stringify({ draft: { entries: [entry], recipient: null }, revision: 0, at: Date.now() - 8 * 60 * 60 * 1000 }))
    vi.mocked(fetch).mockImplementation(async () => response(workspace))
    const { result } = renderHook(() => useReportDraft("", "org:user"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.recovery?.draft.entries[0].activity).toBe(entry.activity)
    expect(sessionStorage.getItem(key)).not.toBeNull()
  })
  it("preserves an explicitly cleared supervisor when reloading a saved draft", async () => {
    vi.mocked(fetch).mockImplementation(async () => response({ ...workspace, lastRecipient: "b0000000-0000-4000-8000-000000000001", report: { id: "report", entries: [], recipient_id: null, revision: 1, draft_open: true } }))
    const { result } = renderHook(() => useReportDraft("", "org:user"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.draft.recipient).toBeNull()
  })
  it("keeps the opened reporting date when a reload happens after midnight", async () => {
    let today = "2026-11-05"
    vi.mocked(fetch).mockImplementation(async url => {
      const requested = new URL(String(url), "https://jota.test").searchParams.get("date")
      return response({ ...workspace, today, date: requested || today })
    })
    const { result } = renderHook(() => useReportDraft("", "org:user"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    today = "2026-11-06"
    await act(async () => { await result.current.reload() })
    expect(result.current.workspace?.date).toBe("2026-11-05")
    expect(result.current.workspace?.today).toBe("2026-11-06")
    expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain("date=2026-11-05")
  })
  it("keeps recovery when a user reverts edits during an in-flight save", async () => {
    let release: (value: Response) => void = () => {}
    let writes = 0
    const entry = { ...newReportEntry(), activity: "Temporary edit" }
    const saved = (entries: unknown[], revision: number) => response({ result: { id: "report", report_date: workspace.date, timezone: workspace.timezone, entries, recipient_id: null, revision, latest_version: 0, draft_open: true, updated_at: "now" } })
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (!init?.body) return response(workspace)
      writes++
      if (writes === 1) return new Promise<Response>(resolve => { release = resolve })
      return saved(JSON.parse(String(init.body)).entries, writes)
    })
    const { result } = renderHook(() => useReportDraft("", "org:user"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.update({ entries: [entry], recipient: null }))
    let saving: Promise<boolean> = Promise.resolve(false)
    act(() => { saving = result.current.flush() })
    await waitFor(() => expect(writes).toBe(1))
    act(() => result.current.update({ entries: [], recipient: null }))
    const cached = JSON.parse(sessionStorage.getItem("jota-report-recovery:org:user:2026-11-05") || "null")
    expect(cached?.draft.entries).toEqual([])
    expect(result.current.status).not.toBe("saved")
    await act(async () => { release(saved([entry], 1)); await saving })
    expect(writes).toBe(2)
    expect(result.current.status).toBe("saved")
  })
  it("does not reload reports when the window regains focus", async () => {
    vi.mocked(fetch).mockResolvedValue(response(workspace))
    const { result } = renderHook(() => useReportDraft("", "org:user"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const calls = vi.mocked(fetch).mock.calls.length
    window.dispatchEvent(new Event("focus"))
    document.dispatchEvent(new Event("visibilitychange"))
    expect(vi.mocked(fetch).mock.calls).toHaveLength(calls)
  })
  it("still saves after a no-op flush and reuses the same request after a lost response", async () => {
    let rejectSave = true
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (!init?.body) return response(workspace)
      if (rejectSave) throw new Error("Network offline")
      const body = JSON.parse(String(init.body))
      return response({ result: { id: "report", report_date: workspace.date, timezone: workspace.timezone, entries: body.entries, recipient_id: body.recipient, revision: 1, latest_version: 0, draft_open: true, updated_at: "now" } })
    })
    const { result } = renderHook(() => useReportDraft("", "org:user"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { expect(await result.current.flush()).toBe(true) })
    act(() => result.current.update({ entries: [{ ...newReportEntry(), activity: "Client call" }], recipient: null }))
    await act(async () => { expect(await result.current.flush()).toBe(false) })
    expect(result.current.status).toBe("error")
    rejectSave = false
    await act(async () => { expect(await result.current.flush()).toBe(true) })
    const posts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.body)
    expect(posts).toHaveLength(2)
    expect(JSON.parse(String(posts[0][1]?.body)).requestId).toBe(JSON.parse(String(posts[1][1]?.body)).requestId)
    expect(result.current.status).toBe("saved")
  })
  it("keeps recovered work separate from the server draft until explicitly restored", async () => {
    const entry = { ...newReportEntry(), activity: "Recovered research" }
    sessionStorage.setItem("jota-report-recovery:org:user:2026-11-05", JSON.stringify({ draft: { entries: [entry], recipient: null }, revision: 0, at: Date.now() }))
    vi.mocked(fetch).mockResolvedValue(response(workspace))
    const { result } = renderHook(() => useReportDraft("", "org:user"))
    await waitFor(() => expect(result.current.recovery).not.toBeNull())
    expect(result.current.draft.entries).toEqual([])
    act(() => result.current.restore())
    expect(result.current.draft.entries[0].activity).toBe("Recovered research")
    expect(result.current.recovery).toBeNull()
  })
})
