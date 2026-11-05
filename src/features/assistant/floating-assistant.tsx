"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowUp, Check, Copy, FileText, Inbox, LoaderCircle, MessageCircle, RefreshCw, Save, Send, Sparkles, X } from "lucide-react"
import type { ReportWorkspace } from "@/lib/assistant/daily-reports"
import styles from "./floating-assistant.module.css"

type Message = { id: string; role: "user" | "assistant"; content: string; mode?: string; notice?: string; sources?: { title: string; href: string }[] }
type AssistantReply = { reply?: string; error?: string; mode?: string; notice?: string; sources?: { title: string; href: string }[]; reportChanged?: boolean; openReport?: boolean }

function FollowingEyes({ track = false }: { track?: boolean }) {
  const face = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!track || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.matchMedia("(pointer: fine)").matches) return
    let frame = 0
    function follow(event: PointerEvent) {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const element = face.current
        if (!element) return
        const bounds = element.getBoundingClientRect()
        const angle = Math.atan2(event.clientY - bounds.top - bounds.height / 2, event.clientX - bounds.left - bounds.width / 2)
        const distance = Math.min(3.5, Math.hypot(event.clientX - bounds.left - bounds.width / 2, event.clientY - bounds.top - bounds.height / 2) / 70)
        element.style.setProperty("--eye-x", `${Math.cos(angle) * distance}px`)
        element.style.setProperty("--eye-y", `${Math.sin(angle) * distance}px`)
      })
    }
    window.addEventListener("pointermove", follow, { passive: true })
    return () => { window.removeEventListener("pointermove", follow); cancelAnimationFrame(frame) }
  }, [track])
  return <span ref={face} className={styles.face} aria-hidden="true"><span className={styles.eye}><span /></span><span className={styles.eye}><span /></span><span className={styles.smile} /></span>
}

export function FloatingAssistant({ userId, userName, canReceive }: { userId: string; userName: string; canReceive: boolean }) {
  const search = useSearchParams()
  const inboxRequested = search.get("assistant") === "reports"
  const [open, setOpen] = useState(inboxRequested)
  const [lastInboxRequest, setLastInboxRequest] = useState(inboxRequested)
  const [tab, setTab] = useState<"chat" | "report" | "inbox">(inboxRequested && canReceive ? "inbox" : "chat")
  const [messages, setMessages] = useState<Message[]>([{ id: "welcome", role: "assistant", content: `Hi ${userName.split(" ")[0]}. I can guide you around Jota and help with your daily report. Save a quick update with “Save:”, or ask me a question.` }])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [workspace, setWorkspace] = useState<ReportWorkspace | null>(null)
  const [body, setBody] = useState("")
  const [recipient, setRecipient] = useState("")
  const [selected, setSelected] = useState("")
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const [replaceDraft, setReplaceDraft] = useState(false)
  const launcher = useRef<HTMLButtonElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const pendingRequest = useRef<{ text: string; id: string } | null>(null)
  const controllers = useRef(new Set<AbortController>())
  const reportLoaded = useRef(false)
  const reportLoading = useRef(false)
  const dirty = body !== (workspace?.report?.body ?? "")
  const sent = workspace?.report?.status === "submitted"
  const stale = Boolean(workspace?.report?.body && workspace.report.body_notes_revision !== workspace.report.notes_revision)

  if (lastInboxRequest !== inboxRequested) {
    setLastInboxRequest(inboxRequested)
    if (inboxRequested) { setOpen(true); setTab(canReceive ? "inbox" : "report") }
  }
  useEffect(() => { const active = controllers.current; return () => { active.forEach((controller) => controller.abort()) } }, [])
  useEffect(() => { if (open && tab === "chat") composer.current?.focus() }, [open, tab])
  useEffect(() => { if (open && tab === "chat" && log.current) log.current.scrollTop = log.current.scrollHeight }, [messages, busy, open, tab])

  const request = useCallback(async function request<T>(url: string, payload?: object): Promise<T> {
    const controller = new AbortController()
    controllers.current.add(controller)
    let timedOut = false
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort() }, 35000)
    try {
      const response = await fetch(url, { method: payload ? "POST" : "GET", credentials: "same-origin", cache: "no-store", headers: payload ? { "Content-Type": "application/json" } : undefined, body: payload ? JSON.stringify(payload) : undefined, signal: controller.signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "The assistant is temporarily unavailable.")
      return result as T
    } catch (failure) { if (timedOut) throw new Error("The request timed out. Your text is still here; please retry."); throw failure }
    finally { window.clearTimeout(timeout); controllers.current.delete(controller) }
  }, [])

  const loadReport = useCallback(async function loadReport(date?: string, preserveEdits = false) {
    if (reportLoading.current) return null
    reportLoading.current = true
    setLoading(true)
    try {
      const data = await request<ReportWorkspace>(`/api/daily-reports${date ? `?date=${encodeURIComponent(date)}` : ""}`)
      setWorkspace(data)
      if (!preserveEdits) setBody(data.report?.body ?? "")
      setRecipient((current) => data.supervisors.some((item) => item.id === current) ? current : "")
      reportLoaded.current = true
      return data
    } catch (failure) {
      if (!(failure instanceof Error && failure.name === "AbortError")) setError(failure instanceof Error ? failure.message : "The report could not load.")
      return null
    } finally { reportLoading.current = false; setLoading(false) }
  }, [request])

  useEffect(() => { if (open && tab !== "chat" && !reportLoaded.current) void loadReport() }, [open, tab, loadReport]) // Fetch report data only when needed, never on navigation or window focus.
  useEffect(() => {
    function showReceived() { setOpen(true); setTab(canReceive ? "inbox" : "report"); void loadReport(workspace?.date, true) }
    window.addEventListener("jota:open-report-inbox", showReceived)
    return () => window.removeEventListener("jota:open-report-inbox", showReceived)
  }, [canReceive, loadReport, workspace?.date])

  function close() { setOpen(false); launcher.current?.focus() }
  function chooseTab(next: "chat" | "report" | "inbox") { setTab(next); setError(""); setStatus(""); if (next !== "chat" && !reportLoaded.current && !loading) void loadReport() }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault()
    const text = input.trim()
    if (!text || busy || loading) return
    setBusy(true); setError(""); setStatus("")
    if (pendingRequest.current?.text !== text) pendingRequest.current = { text, id: crypto.randomUUID() }
    const id = pendingRequest.current.id
    const history = messages.filter((item) => item.id !== "welcome" && item.id !== id && item.mode !== "report" && !/^(?:save|log|note)\s*:/i.test(item.content)).slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 2000) }))
    setMessages((current) => current.some((item) => item.id === id) ? current : [...current.slice(-22), { id, role: "user", content: text }])
    try {
      const result = await request<AssistantReply>("/api/assistant", { message: text, history, date: workspace?.date, requestId: id })
      const reply: Message = { id: crypto.randomUUID(), role: "assistant", content: result.reply ?? "Please try again.", mode: result.mode, notice: result.notice, sources: result.sources }
      setMessages((current) => [...current.map((item) => item.id === id ? { ...item, mode: result.mode } : item), reply].slice(-24))
      setInput(""); pendingRequest.current = null
      if (result.reportChanged) await loadReport(workspace?.date, dirty)
      if (result.openReport) setTab("report")
    } catch (failure) {
      if (!(failure instanceof Error && failure.name === "AbortError")) setError(failure instanceof Error ? failure.message : "Message could not be sent.")
    } finally { setBusy(false) }
  }

  async function reportAction(action: "save" | "send" | "generate", replace = false) {
    if (busy || loading || !workspace) return
    if (action === "generate" && !replace && (dirty || workspace.report?.body)) { setReplaceDraft(true); return }
    setBusy(true); setError(""); setStatus("")
    try {
      const data = await request<ReportWorkspace>("/api/daily-reports", { action, date: workspace.date, body, recipientId: recipient, revision: workspace.report?.revision ?? 0, replace })
      setWorkspace(data); setBody(data.report?.body ?? ""); setReplaceDraft(false)
      setStatus(action === "send" ? "Report sent to your supervisor." : action === "generate" ? "Draft generated from saved updates. Review it before sending." : "Report saved.")
    } catch (failure) {
      if (!(failure instanceof Error && failure.name === "AbortError")) setError(failure instanceof Error ? failure.message : "The report could not be saved.")
    } finally { setBusy(false) }
  }

  async function copyReport() {
    try { await navigator.clipboard.writeText(body); setStatus("Report copied. You can share it outside Jota.") } catch { setError("Copy is unavailable. Select the report text and copy it manually.") }
  }

  const received = workspace?.inbox.find((item) => item.id === selected)
  return <div className={styles.root} data-user-id={userId}>
    {open && <section className={styles.panel} role="dialog" aria-modal="false" aria-labelledby="jota-assistant-title" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close() } }}>
      <header className={styles.header}><FollowingEyes /><div><h2 id="jota-assistant-title">Jota assistant</h2><p>Reports, answers & guidance</p></div><button type="button" className={styles.iconButton} onClick={close} aria-label="Close assistant"><X aria-hidden="true" size={18} /></button></header>
      <div className={styles.tabs} role="tablist" aria-label="Assistant tools">
        {([{ key: "chat", label: "Ask Jota", icon: MessageCircle }, { key: "report", label: "My report", icon: FileText }, ...(canReceive ? [{ key: "inbox", label: "Received", icon: Inbox }] : [])] as const).map(({ key, label, icon: Icon }) => <button key={key} type="button" role="tab" id={`assistant-${key}-tab`} aria-selected={tab === key} aria-controls={`assistant-${key}-panel`} onClick={() => chooseTab(key as typeof tab)}><Icon size={14} aria-hidden="true" />{label}</button>)}
      </div>
      {tab === "chat" && <div className={styles.chatPanel} id="assistant-chat-panel" role="tabpanel" aria-labelledby="assistant-chat-tab">
        <div className={styles.chatLog} ref={log} role="log" aria-label="Assistant conversation" aria-live="polite" aria-relevant="additions">
          {messages.map((message) => <article key={message.id} className={message.role === "user" ? styles.userMessage : styles.assistantMessage}>
            <span className={styles.srOnly}>{message.role === "user" ? "You" : "Jota assistant"}: </span><p>{message.content}</p>
            {message.notice && <p className={styles.notice}>{message.notice}</p>}
            {message.sources?.length ? <div className={styles.sources}>{message.sources.map((source) => <Link key={source.href} href={source.href}>{source.title}</Link>)}</div> : null}
          </article>)}
          {busy && <p className={styles.thinking} role="status"><LoaderCircle size={14} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Working…</p>}
        </div>
        <div className={styles.quickActions}><button type="button" disabled={busy} onClick={() => { setInput("Save: "); composer.current?.focus() }}><Save size={12} aria-hidden="true" />Save an update</button><button type="button" disabled={busy} onClick={() => chooseTab("report")}><FileText size={12} aria-hidden="true" />My report</button><button type="button" disabled={busy} onClick={() => { setInput("How do I import content?"); composer.current?.focus() }}>Content help</button></div>
        <form onSubmit={sendMessage} className={styles.composer}><label htmlFor="jota-assistant-message" className={styles.srOnly}>Ask Jota or save a work update</label><textarea ref={composer} id="jota-assistant-message" maxLength={2000} rows={2} value={input} onChange={(event) => setInput(event.target.value)} disabled={busy} placeholder="Ask a question, or type Save: …" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage() } }} /><button type="submit" className={styles.sendButton} disabled={busy || loading || !input.trim()} aria-label="Send message"><ArrowUp size={18} aria-hidden="true" /></button></form>
        <p className={styles.footerHint}>{workspace ? `Report date: ${workspace.date} · ` : ""}“Generate my daily report” creates a draft, not a submission.</p>
      </div>}
      {tab === "report" && <div className={styles.reportPanel} id="assistant-report-panel" role="tabpanel" aria-labelledby="assistant-report-tab">
        <div className={styles.dateRow}><label htmlFor="assistant-report-date">Report date<input id="assistant-report-date" type="date" value={workspace?.date ?? ""} max={workspace?.today} disabled={loading || busy || dirty} onChange={(event) => { setError(""); void loadReport(event.target.value) }} /></label><button type="button" className={styles.iconButton} disabled={loading || busy || dirty} onClick={() => { setError(""); void loadReport(workspace?.date) }} aria-label="Reload report"><RefreshCw size={16} aria-hidden="true" /></button></div>
        {workspace && <p className={styles.hint}>{workspace.timezone} · {sent ? "Sent to supervisor" : "Private draft"}</p>}
        {loading && <p role="status" className={styles.hint}>Loading report…</p>}
        {workspace && <>
          <details className={styles.savedNotes}><summary>Saved updates ({workspace.notes.length})</summary>{workspace.notes.length ? <ul>{workspace.notes.map((note) => <li key={note.id}>{note.body}</li>)}</ul> : <p className={styles.hint}>Use “Save:” in Ask Jota to collect updates throughout your day.</p>}</details>
          {stale && <p className={styles.warning}>New updates were saved after this draft. Generate from notes again, or edit and save your report to include them.</p>}
          <label htmlFor="assistant-report-body" className={styles.fieldLabel}>Your daily report</label><textarea className={styles.reportBody} id="assistant-report-body" rows={9} maxLength={20000} value={body} readOnly={sent} disabled={busy || loading} onChange={(event) => setBody(event.target.value)} placeholder="Generate from your saved updates or write your report here." />
          <div className={styles.reportActions}><button type="button" className={styles.primaryButton} disabled={busy || loading || !dirty || !body.trim() || sent} onClick={() => void reportAction("save")}>{busy ? <LoaderCircle size={14} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Save size={14} aria-hidden="true" />}Save report</button><button type="button" className={styles.secondaryButton} disabled={busy || loading || !workspace.notes.length || sent} onClick={() => void reportAction("generate")}><Sparkles size={14} aria-hidden="true" />Generate from notes</button><button type="button" className={styles.secondaryButton} disabled={!body.trim()} onClick={() => void copyReport()}><Copy size={14} aria-hidden="true" />Copy</button></div>
          {dirty && <p className={styles.hint}>Save changes before switching the report date or sending.</p>}
          {replaceDraft && <div className={styles.replacePrompt}><p>Replace the current draft with a new one from saved updates? Your original notes will stay saved.</p><div><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setReplaceDraft(false)}>Keep draft</button><button type="button" className={styles.primaryButton} disabled={busy} onClick={() => void reportAction("generate", true)}>Replace draft</button></div></div>}
          {!canReceive && !sent && <div className={styles.handoff}><label htmlFor="assistant-supervisor" className={styles.fieldLabel}>Send to supervisor</label><select id="assistant-supervisor" value={recipient} disabled={busy || loading} onChange={(event) => setRecipient(event.target.value)}><option value="">Choose a supervisor</option>{workspace.supervisors.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select><button type="button" className={styles.primaryButton} disabled={busy || loading || dirty || stale || !recipient || !workspace.report?.body.trim()} onClick={() => void reportAction("send")}><Send size={14} aria-hidden="true" />Send to supervisor</button></div>}
          {canReceive && <p className={styles.hint}>Your own report stays here. Use Copy to share it with the CEO outside Jota.</p>}
          {sent && <p className={styles.success}><Check size={14} aria-hidden="true" />Sent reports are locked. Your supervisor can read this version.</p>}
        </>}
      </div>}
      {tab === "inbox" && canReceive && <div className={styles.reportPanel} id="assistant-inbox-panel" role="tabpanel" aria-labelledby="assistant-inbox-tab"><div className={styles.inboxHeading}><h3>Received reports</h3><button type="button" className={styles.iconButton} disabled={loading || busy || dirty} onClick={() => { setError(""); void loadReport(workspace?.date) }} aria-label="Refresh received reports"><RefreshCw size={16} aria-hidden="true" /></button></div><p className={styles.hint}>Latest 30 reports sent directly to you.</p>{loading && <p role="status" className={styles.hint}>Loading reports…</p>}{workspace && !workspace.inbox.length && <p className={styles.empty}>No daily reports have been sent to you yet.</p>}<div className={styles.inboxList}>{workspace?.inbox.map((item) => <button type="button" key={item.id} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}><span>{item.authorName}</span><small>{item.report_date}</small></button>)}</div>{received && <article className={styles.receivedReport}><h3>{received.authorName}</h3><p className={styles.hint}>{received.report_date}</p><p>{received.body}</p></article>}</div>}
      {error && <p className={styles.error} role="alert">{error}</p>}{status && <p className={styles.status} role="status" aria-live="polite">{status}</p>}
    </section>}
    <button ref={launcher} type="button" className={styles.launcher} onClick={() => setOpen((value) => !value)} aria-label={open ? "Minimize Jota assistant" : "Open Jota assistant"} aria-expanded={open} aria-controls={open ? "jota-assistant-title" : undefined}><FollowingEyes track /><span className={styles.launcherLabel}>Ask Jota</span></button>
  </div>
}
