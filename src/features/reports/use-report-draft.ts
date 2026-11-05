"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { z } from "zod"
import { reportEntrySchema, type ReportEntry, type ReportWorkspace, type WorkReport } from "./report-model"

export async function reportRequest<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(15000)
  let response: Response
  try { response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }) }
  catch (error) { if (signal?.aborted) throw error; throw new Error("Could not reach Jota. Keep your report open and retry.") }
  let result
  try { result = await response.json() } catch { throw new Error("Jota returned an unexpected response. Keep your report open and retry.") }
  if (!response.ok) throw new Error(result.error || "The request failed. Your work is still here.")
  return result as T
}
type Draft = { entries: ReportEntry[]; recipient: string | null }
type Recovery = { draft: Draft; revision: number; at: number }
const recoverySchema = z.object({ draft: z.object({ entries: z.array(reportEntrySchema).max(100), recipient: z.uuid().nullable() }), revision: z.number().int().nonnegative(), at: z.number().finite() })
const encoded = (d: Draft) => JSON.stringify(d)

export function useReportDraft(date: string, userKey: string) {
  const [workspace, setWorkspace] = useState<ReportWorkspace | null>(null)
  const [draft, setDraftState] = useState<Draft>({ entries: [], recipient: null })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<"saved" | "unsaved" | "saving" | "error">("saved")
  const [error, setError] = useState("")
  const [recovery, setRecovery] = useState<Recovery | null>(null)
  const current = useRef<{ workspace: ReportWorkspace; draft: Draft; saved: string } | null>(null)
  const activeSave = useRef<Promise<boolean> | null>(null)
  const pending = useRef<{ snapshot: string; body: object } | null>(null)
  const selectedDay = useRef<{ userKey: string; date: string } | null>(null)
  const cacheKey = (day: string) => `jota-report-recovery:${userKey}:${day}`
  const store = useCallback((day: string, value: Recovery | null) => {
    try { const key = `jota-report-recovery:${userKey}:${day}`; if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key) } catch { /* Server autosave remains available when browser storage is blocked. */ }
  }, [userKey])
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("")
    try {
      const requestedDate = date || (selectedDay.current?.userKey === userKey ? selectedDay.current.date : "")
      const value = await reportRequest<ReportWorkspace>(`/api/reports${requestedDate ? `?date=${requestedDate}` : ""}`, undefined, signal)
      if (signal?.aborted) return
      selectedDay.current = { userKey, date: value.date }
      const next = { entries: value.report?.entries ?? [], recipient: value.report ? value.report.recipient_id : value.lastRecipient }
      current.current = { workspace: value, draft: next, saved: encoded(next) }; pending.current = null
      setWorkspace(value); setDraftState(next); setStatus("saved"); setRecovery(null)
      try {
        const cached = recoverySchema.safeParse(JSON.parse(sessionStorage.getItem(`jota-report-recovery:${userKey}:${value.date}`) || "null"))
        // Pending edits remain recoverable for this browser-tab session, even
        // after a long outage. Only acknowledged or explicitly discarded work
        // is removed; sign-out clears every report recovery buffer.
        if (cached.success && encoded(cached.data.draft) !== encoded(next)) setRecovery(cached.data)
        else store(value.date, null)
      } catch { store(value.date, null) }
    } catch (e) { if (!signal?.aborted) { current.current = null; setWorkspace(null); setError(e instanceof Error ? e.message : "Could not load your report.") } }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [date, userKey, store])
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void load(controller.signal), 0); return () => { clearTimeout(timer); controller.abort() } }, [load])
  const update = useCallback((value: Draft) => {
    const state = current.current
    if (!state || state.workspace.report?.draft_open === false) return
    state.draft = value; setDraftState(value)
    const dirty = encoded(value) !== state.saved
    const saving = Boolean(pending.current)
    setStatus(previous => previous === "error" ? previous : saving ? "saving" : dirty ? "unsaved" : "saved")
    store(state.workspace.date, dirty || saving ? { draft: value, revision: state.workspace.report?.revision ?? 0, at: Date.now() } : null)
  }, [store])
  const flush = useCallback((): Promise<boolean> => {
    if (activeSave.current) return activeSave.current
    if (!current.current || (!pending.current && encoded(current.current.draft) === current.current.saved)) return Promise.resolve(true)
    activeSave.current = (async () => {
      try {
        while (current.current && (pending.current || encoded(current.current.draft) !== current.current.saved)) {
          const state = current.current
          if (state.workspace.report?.draft_open === false) return false
          if (!pending.current) pending.current = { snapshot: encoded(state.draft), body: { action: "save", date: state.workspace.date, ...state.draft, revision: state.workspace.report?.revision ?? 0, requestId: crypto.randomUUID() } }
          const request = pending.current
          setStatus("saving")
          const { result } = await reportRequest<{ result: WorkReport }>("/api/reports", request.body)
          // Date changes only occur after flushing; never apply a late response to a different report.
          if (current.current !== state) return false
          state.workspace = { ...state.workspace, report: result }; state.saved = request.snapshot; pending.current = null
          setWorkspace(state.workspace)
          store(state.workspace.date, encoded(state.draft) === state.saved ? null : { draft: state.draft, revision: result.revision, at: Date.now() })
        }
        setStatus("saved"); setError(""); return true
      } catch (e) { setStatus("error"); setError(e instanceof Error ? e.message : "Saving failed. Retry without closing this page."); return false }
      finally { activeSave.current = null }
    })()
    return activeSave.current
  }, [store])
  useEffect(() => {
    if (status !== "unsaved" || recovery) return
    const timer = setTimeout(() => void flush(), 750)
    return () => clearTimeout(timer)
  }, [draft, status, flush, recovery])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (current.current && (pending.current || encoded(current.current.draft) !== current.current.saved)) event.preventDefault() }
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn)
  }, [])
  useEffect(() => {
    const signedOut = () => { current.current = null; pending.current = null }
    window.addEventListener("jota:report-signout", signedOut)
    return () => { window.removeEventListener("jota:report-signout", signedOut); current.current = null }
  }, [])
  const clearRecovery = () => { if (workspace) store(workspace.date, null); setRecovery(null) }
  const restore = () => { if (!recovery || recovery.revision !== (workspace?.report?.revision ?? 0) || workspace?.report?.draft_open === false) return; update(recovery.draft); setRecovery(null) }
  return { workspace, draft, loading: loading || Boolean(date && workspace && date !== workspace.date), status, error, recovery, update, flush, reload: load, currentReport: () => current.current?.workspace.report, restore, clearRecovery, cacheKey }
}
