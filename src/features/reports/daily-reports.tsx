"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowUpRight, Check, Clock3, Copy, Eye, History, LoaderCircle, MoreHorizontal, Pencil, Plus, RefreshCw, Send, ListPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { entryErrors, newReportEntry, overlappingEntries, reportDate, reportText, reportVersionStatus, suggestionText, type ActivitySuggestion, type ReceivedReportSummary, type ReportEntry, type ReportVersion, type VersionSummary } from "./report-model"
import { reportRequest, useReportDraft } from "./use-report-draft"
import styles from "./daily-reports.module.css"

type Props = { userId: string; organizationId: string; name: string; jobTitle: string | null; canReceive: boolean }
type HistoryItem = { id: string; report_date: string; draft_open: boolean; latest_version: number; updated_at: string; checked_at: string | null }
export function DailyReports(props: Props) {
  const search = useSearchParams(), router = useRouter()
  const [date, setDate] = useState("")
  const [dateLimit, setDateLimit] = useState<{ zone: string; today: string } | null>(null)
  const [tab, setTab] = useState<"own" | "history" | "team">(search.get("view") === "team" && props.canReceive ? "team" : "own")
  const draft = useReportDraft(date, `${props.organizationId}:${props.userId}`)
  const [preview, setPreview] = useState(false), [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<ActivitySuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [selected, setSelected] = useState<ReportVersion | null>(null), [versionOpen, setVersionOpen] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("")
  const [confirmReload, setConfirmReload] = useState(false), [overlapConfirmed, setOverlapConfirmed] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const submitRequest = useRef<string | null>(null)
  const versionRequest = useRef(0)
  const entries = draft.draft.entries, workspace = draft.workspace
  const locked = workspace?.report?.draft_open === false
  const disabled = busy || draft.loading || Boolean(draft.recovery) || locked
  const recipientName = workspace?.supervisors.find(person => person.id === workspace.report?.recipient_id)?.display_name
  const warnings = overlappingEntries(entries)
  const calendarZone = workspace?.calendarTimezone || workspace?.timezone || "Asia/Manila"
  const availableToday = dateLimit?.zone === calendarZone && dateLimit.today > (workspace?.today || "") ? dateLimit.today : workspace?.today || ""
  const openVersion = useCallback(async (id: string) => {
    const request = ++versionRequest.current
    setVersionOpen(true); setSelected(null); setError("")
    try { const value = await reportRequest<ReportVersion>(`/api/reports?kind=version&id=${id}`); if (request === versionRequest.current) setSelected(value) }
    catch (e) { if (request === versionRequest.current) setError(message(e)) }
  }, [])
  const requestedVersion = search.get("report")
  useEffect(() => { if (!requestedVersion || !/^[0-9a-f-]{36}$/i.test(requestedVersion)) return; const timer = setTimeout(() => void openVersion(requestedVersion), 0); return () => clearTimeout(timer) }, [requestedVersion, openVersion])
  async function switchTab(next: typeof tab) { if (await draft.flush()) { setTab(next); setError(""); setNotice("") } }
  async function switchDate(next: string) { if (next && await draft.flush()) { setDate(next); setError(""); setNotice("") } }
  function updateEntry(id: string, patch: Partial<ReportEntry>) {
    setOverlapConfirmed(false); submitRequest.current = null
    draft.update({ ...draft.draft, entries: entries.map(entry => entry.id === id ? { ...entry, ...patch } : entry) })
  }
  function addEntry(entry = newReportEntry()) { setOverlapConfirmed(false); submitRequest.current = null; draft.update({ ...draft.draft, entries: [...entries, entry] }) }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setNotice("Copied") } catch { setError("Copy was unavailable. Select the report text in Preview to copy it.") } }
  async function showPreview() {
    setError(""); setNotice("")
    const errors = entryErrors(entries)
    if (errors.length) { setError(errors.join(" ")); return }
    if (await draft.flush()) setPreview(true)
  }
  async function submit() {
    if (busy) return
    setBusy(true); setError("")
    try {
      if (!(await draft.flush())) return
      const report = draft.currentReport()
      if (!report || !report.recipient_id || !workspace?.supervisors.some(p => p.id === report.recipient_id)) throw new Error("Choose an active supervisor.")
      if (entryErrors(report.entries).length) throw new Error("Complete the activity fields before submitting.")
      if (overlappingEntries(report.entries).length && !overlapConfirmed) throw new Error("Confirm the overlapping times before submitting.")
      submitRequest.current ||= crypto.randomUUID()
      await reportRequest("/api/reports", { action: "submit", reportId: report.id, revision: report.revision, requestId: submitRequest.current })
      setPreview(false); submitRequest.current = null; await draft.reload(); setNotice("Submitted")
    } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  async function correct() {
    const report = draft.currentReport(); if (!report || busy) return
    setBusy(true); setError("")
    try { await reportRequest("/api/reports", { action: "correct", reportId: report.id, revision: report.revision }); await draft.reload(); setNotice("Correction draft ready") }
    catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  async function showSuggestions() {
    if (!workspace) return
    setSuggestionsOpen(true); setSuggestionsLoading(true); setSuggestions([]); setError("")
    try { const result = await reportRequest<{ items: ActivitySuggestion[] }>(`/api/reports?kind=suggestions&date=${workspace.date}`); setSuggestions(result.items) }
    catch (e) { setError(message(e)) } finally { setSuggestionsLoading(false) }
  }
  async function checkReport() {
    if (!selected || busy) return
    setBusy(true); setError("")
    try { await reportRequest("/api/reports", { action: "check", versionId: selected.id }); await openVersion(selected.id); setRefresh(r => r + 1); setNotice("Checked") }
    catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  const initials = props.name.split(/\s+/).map(p => p[0]).join("").slice(0, 2)
  return <main className={styles.page}>
    <header className={styles.header}><h1>Daily report</h1><div className={styles.tabs} role="tablist" aria-label="Reports">
      {(["own", "history", ...(props.canReceive ? ["team"] : [])] as (typeof tab)[]).map(item => <button key={item} type="button" role="tab" aria-selected={tab === item} aria-controls={`reports-${item}`} id={`reports-tab-${item}`} disabled={busy || draft.status === "saving"} onClick={() => void switchTab(item)}>{item === "own" ? "My report" : item === "team" ? "Team reports" : "History"}</button>)}
    </div></header>
    {(error || draft.error) && <div role="alert" className={styles.notice} data-error="true">{error || draft.error} {draft.status === "error" && <Button variant="outline" size="sm" onClick={() => void draft.flush()}>Retry save</Button>} <Button variant="ghost" size="sm" onClick={() => void copy(reportText(props.name, workspace?.date || date, workspace?.timezone || "", entries))}><Copy />Copy current work</Button> <Button variant="ghost" size="sm" onClick={() => setConfirmReload(true)}>Reload saved</Button></div>}
    {confirmReload && <div className={styles.notice}>Reload the saved report? Unsaved changes may be replaced.<div className={styles.actions}><Button variant="outline" onClick={() => setConfirmReload(false)}>Keep editing</Button><Button onClick={() => { setConfirmReload(false); draft.clearRecovery(); void draft.reload() }}>Reload saved</Button></div></div>}
    {notice && <p role="status" className={styles.muted}>{notice}</p>}
    {tab === "own" && <section id="reports-own" className={styles.editor} role="tabpanel" aria-labelledby="reports-tab-own">
      {draft.loading ? <div className={styles.loading} role="status"><LoaderCircle className="size-4 animate-spin" />Loading report…</div> : workspace && <>
        {draft.recovery && <div className={styles.notice}>Unsaved work was recovered from this tab.<div className={styles.actions}><Button disabled={draft.recovery.revision !== (workspace.report?.revision ?? 0) || locked} onClick={draft.restore}>Restore</Button><Button variant="outline" onClick={() => void copy(reportText(props.name, workspace.date, workspace.timezone, draft.recovery!.draft.entries))}>Copy recovered work</Button><Button variant="ghost" onClick={draft.clearRecovery}>Discard recovery</Button></div>{draft.recovery.revision !== (workspace.report?.revision ?? 0) && <p>The saved report has changed. Copy the recovered work before discarding it.</p>}</div>}
        <div className={styles.card}>
          <div className={styles.toolbar}><div className={styles.identity}><Avatar><AvatarFallback>{initials}</AvatarFallback></Avatar><div><strong>{props.name}</strong><small>{props.jobTitle}</small></div></div>
            <div className={styles.reportControls}>
              <div className={styles.date}><label className="sr-only" htmlFor="report-date">Report date</label><input id="report-date" type="date" value={workspace.date} max={workspace.date > availableToday ? workspace.date : availableToday} disabled={busy || draft.status === "saving" || Boolean(draft.recovery)} onFocus={() => setDateLimit({ zone: calendarZone, today: reportDate(calendarZone) })} onChange={e => void switchDate(e.target.value)} /></div>
              {locked ? <Badge variant="outline" className={workspace.versions[0]?.checked_at ? styles.checkBadge : undefined} data-checked={Boolean(workspace.versions[0]?.checked_at)}>{workspace.versions[0]?.checked_at && <Check aria-hidden="true" />}{workspace.versions[0]?.checked_at ? "Checked" : "Submitted"}</Badge> : <Badge variant="outline">{workspace.report?.latest_version ? "Correction draft" : "Draft"}</Badge>}
              <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" className={styles.reportMenuButton} disabled={busy || Boolean(draft.recovery)} aria-label="Report actions" />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem onClick={() => void copy(reportText(props.name, workspace.date, workspace.timezone, entries))}><Copy />Copy report</DropdownMenuItem>
                {locked && <DropdownMenuItem onClick={() => void correct()}><Pencil />Create correction</DropdownMenuItem>}
                <DropdownMenuItem disabled={!workspace.report || !workspace.versions.length} onClick={() => setHistoryOpen(true)}><History />Version history</DropdownMenuItem>
              </DropdownMenuContent></DropdownMenu>
            </div></div>
          <div className={`${styles.grid} ${styles.columns}`} aria-hidden="true"><span>Activity</span><span>Start</span><span>End</span><span>Progress</span><span>Remarks</span><span /></div>
          {!entries.length && <p className={styles.empty}>No activities yet.</p>}
          {entries.map((entry, index) => <div className={`${styles.grid} ${styles.row}`} key={entry.id} role="group" aria-label={`Activity ${index + 1}`}>
            <label className={`${styles.field} ${styles.activity}`}><span>Activity</span><textarea aria-label={`Activity ${index + 1} description`} rows={1} maxLength={500} placeholder="Activity…" value={entry.activity} disabled={disabled} onChange={e => updateEntry(entry.id, { activity: e.target.value })} /></label>
            <label className={styles.field}><span>Start</span><input aria-label={`Activity ${index + 1} start`} type="time" value={entry.start} disabled={disabled} onChange={e => updateEntry(entry.id, { start: e.target.value })} /></label>
            <div><label className={styles.field}><span>End</span><input aria-label={`Activity ${index + 1} end`} type="time" value={entry.end} disabled={disabled} onChange={e => updateEntry(entry.id, { end: e.target.value })} /></label>{(entry.nextDay || Boolean(entry.start && entry.end && entry.end <= entry.start)) && <label className={styles.nextDay}><input type="checkbox" checked={entry.nextDay} disabled={disabled} onChange={e => updateEntry(entry.id, { nextDay: e.target.checked })} aria-label={`Activity ${index + 1} ends next day`} />Ends next day</label>}</div>
            <label className={`${styles.field} ${styles.progressField}`}><span>Progress</span><div className={styles.progress}><input aria-label={`Activity ${index + 1} progress`} type="number" min={0} max={100} step={1} placeholder="0-100" title="Progress at the end of this work session" value={entry.progress ?? ""} disabled={disabled} onChange={e => updateEntry(entry.id, { progress: e.target.value === "" ? null : Math.min(100, Math.max(0, Math.round(Number(e.target.value)))) })} />%</div><div aria-hidden="true" className={styles.bar} data-complete={entry.progress === 100}><i style={{ width: `${entry.progress ?? 0}%` }} /></div></label>
            <label className={`${styles.field} ${styles.remarks}`}><span>Remarks</span><textarea aria-label={`Activity ${index + 1} remarks`} rows={1} placeholder="Optional remarks" value={entry.remarks} disabled={disabled} maxLength={1000} onChange={e => updateEntry(entry.id, { remarks: e.target.value })} /></label>
            <div className={styles.rowActions}><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" disabled={disabled} aria-label={`Activity ${index + 1} actions`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={entries.length >= 100} onClick={() => addEntry({ ...entry, id: crypto.randomUUID(), sourceId: null })}>Duplicate activity</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => { submitRequest.current = null; draft.update({ ...draft.draft, entries: entries.filter(e => e.id !== entry.id) }) }}>Remove activity</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
          </div>)}
          {!locked && <div className={styles.add}><Button variant="outline" disabled={disabled || entries.length >= 100} onClick={() => addEntry()}><Plus />Add activity</Button><Button variant="ghost" disabled={disabled || entries.length >= 100} onClick={() => void showSuggestions()}><ListPlus />Add from Jota</Button></div>}
          <footer className={styles.footer}>
            {locked ? <>
              <span className={styles.muted}>{recipientName ? `Sent to ${recipientName}` : "Submitted report"}</span>
              {workspace.versions[0]?.checked_at && <span className={styles.muted}>Checked at {new Date(workspace.versions[0].checked_at).toLocaleTimeString("en", { timeZone: workspace.timezone, hour: "numeric", minute: "2-digit" })}</span>}
            </> : <>
              <span className={styles.muted} role="status" aria-live="polite">{draft.status === "saving" ? "Saving…" : draft.status === "unsaved" ? "Unsaved changes" : draft.status === "error" ? "Not saved" : "Saved"}</span>
              <div className={styles.actions}><label className="sr-only" htmlFor="report-supervisor">Send to supervisor</label><select id="report-supervisor" value={draft.draft.recipient || ""} disabled={disabled} onChange={e => { submitRequest.current = null; draft.update({ ...draft.draft, recipient: e.target.value || null }) }}><option value="">Choose supervisor</option>{draft.draft.recipient && !workspace.supervisors.some(p => p.id === draft.draft.recipient) && <option value={draft.draft.recipient}>Previous supervisor unavailable</option>}{workspace.supervisors.map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select>
                <Button disabled={disabled || !entries.length} onClick={() => void showPreview()}><Eye />Preview & submit</Button></div>
            </>}
          </footer>
        </div>
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}><SheetContent className={styles.previewSheet}>
          <header className={styles.previewHeader}><SheetTitle>Version history</SheetTitle><SheetDescription>Submitted versions for {workspace.date}.</SheetDescription></header>
          <div className={styles.previewBody}>{workspace.report && workspace.versions.length > 0 && <VersionHistory key={`${workspace.report.id}:${workspace.report.latest_version}`} reportId={workspace.report.id} initial={workspace.versions} timezone={workspace.timezone} onOpen={id => { setHistoryOpen(false); void openVersion(id) }} />}</div>
        </SheetContent></Sheet>
      </>}
    </section>}
    {tab !== "own" && <ReportList key={tab} refreshKey={refresh} kind={tab} onOpen={id => void openVersion(id)} onDate={day => { void (async () => { if (await draft.flush()) { setDate(day); setTab("own") } })() }} />}
    <Sheet open={preview} onOpenChange={open => { if (!busy) setPreview(open) }}>
      <SheetContent className={styles.previewSheet}>
        <header className={styles.previewHeader}>
          <SheetTitle>Preview report</SheetTitle>
          <SheetDescription className="sr-only">Review your activities and choose the supervisor who will receive this report.</SheetDescription>
        </header>
        <div className={styles.previewBody}>
          <div className={styles.previewIdentity}>
            <div className={styles.identity}>
              <Avatar><AvatarFallback>{initials}</AvatarFallback></Avatar>
              <div><strong>{props.name}</strong>{props.jobTitle && <small>{props.jobTitle}</small>}</div>
            </div>
            <div className={styles.previewDate}>
              <strong>{workspace && new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${workspace.date}T12:00:00Z`))}</strong>
              <span>{workspace?.timezone.replace(/_/g, " ")}</span>
            </div>
          </div>
          <div className={styles.previewSectionTitle}><h3>Activities</h3><span>{entries.length}</span></div>
          <ReadEntries entries={entries} sourceLinks={workspace?.sourceLinks} />
          {warnings.length > 0 && <div className={styles.overlapNotice}>
            <label><input type="checkbox" checked={overlapConfirmed} onChange={e => setOverlapConfirmed(e.target.checked)} disabled={busy} />I checked the overlapping times.</label>
            <p>{warnings.join(" ")}</p>
          </div>}
        </div>
        <footer className={styles.previewFooter}>
          <div className={styles.previewRecipient}>
            <label htmlFor="preview-report-supervisor">Supervisor</label>
            <select id="preview-report-supervisor" value={draft.draft.recipient || ""} disabled={busy} onChange={e => {
              submitRequest.current = null
              draft.update({ ...draft.draft, recipient: e.target.value || null })
            }}>
              <option value="">Choose supervisor</option>
              {draft.draft.recipient && !workspace?.supervisors.some(p => p.id === draft.draft.recipient) && <option value={draft.draft.recipient} disabled>Previous supervisor unavailable</option>}
              {workspace?.supervisors.map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}
            </select>
          </div>
          {workspace?.supervisors.length === 0 && <p className={styles.muted}>No eligible supervisors available.</p>}
          {(error || draft.error) && <div role="alert" className={styles.previewError}>
            <p>{error || draft.error}</p>
            {draft.status === "error" && <Button variant="outline" size="sm" disabled={busy} onClick={() => void draft.flush()}>Retry save</Button>}
          </div>}
          <div className={styles.previewButtons}>
            <Button variant="outline" disabled={busy} onClick={() => setPreview(false)}>Back to edit</Button>
            <Button disabled={busy || draft.status === "saving" || draft.status === "error" || !workspace?.supervisors.some(p => p.id === draft.draft.recipient) || (warnings.length > 0 && !overlapConfirmed)} onClick={() => void submit()}>
              {busy || draft.status === "saving" ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Send aria-hidden="true" />}
              {busy ? "Submitting…" : draft.status === "saving" ? "Saving…" : "Submit report"}
            </Button>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
    <Sheet open={suggestionsOpen} onOpenChange={setSuggestionsOpen}><SheetContent className="w-full sm:max-w-xl"><div className={styles.panel}><SheetTitle>Add from Jota</SheetTitle><SheetDescription>Choose activities. Confirm your work times and progress.</SheetDescription>{suggestionsLoading && <p role="status" className={styles.loading}>Loading activities…</p>}{error && <p role="alert">{error}</p>}{!suggestionsLoading && !suggestions.length && !error && <p className={styles.empty}>No matching activity. You can add an activity manually.</p>}{suggestions.map(item => { const added = entries.some(entry => entry.sourceId === item.id); return <div className={styles.suggestion} key={item.id}><div>{suggestionText(item)}<small className="mt-1 block text-muted-foreground">{new Date(item.occurred_at).toLocaleTimeString("en", { timeZone: workspace?.timezone, hour: "numeric", minute: "2-digit" })} · action recorded</small></div><Button size="sm" variant="outline" disabled={added || entries.length >= 100 || disabled} onClick={() => addEntry({ ...newReportEntry(), activity: suggestionText(item), sourceId: item.id })}>{added ? <Check /> : <Plus />}{added ? "Added" : "Add"}</Button></div> })}</div></SheetContent></Sheet>
    <Sheet open={versionOpen} onOpenChange={open => { setVersionOpen(open); if (!open) { versionRequest.current++; setSelected(null); if (requestedVersion) router.replace("/reports?view=team", { scroll: false }) } }}><SheetContent className="w-full sm:max-w-3xl"><div className={styles.panel}><SheetTitle>{selected?.author_name || "Report"}</SheetTitle><SheetDescription>{selected ? `${selected.report_date} · ${selected.timezone} · Version ${selected.version_number}` : "Loading report…"}</SheetDescription>
      {selected && <><div className="mt-4"><ReportCheckBadge checkedAt={selected.checked_at} /></div>{!selected.is_latest && <p className={styles.notice}>Earlier version. A newer correction exists; this received version is read-only.</p>}<ReadEntries entries={selected.entries} sourceLinks={selected.sourceLinks} /><div className={styles.panelActions}><Button variant="outline" onClick={() => void copy(reportText(selected.author_name, selected.report_date, selected.timezone, selected.entries))}><Copy />Copy</Button>{selected.recipient_id === props.userId && props.canReceive && selected.is_latest && <Button disabled={busy || Boolean(selected.checked_at)} onClick={() => void checkReport()}><Check />{selected.checked_at ? "Checked" : "Mark checked"}</Button>}</div>{selected.checked_at && <p className="mt-3 text-xs text-muted-foreground">Checked {new Date(selected.checked_at).toLocaleString("en", { timeZone: selected.timezone })}</p>}</>}{error && <p role="alert" className={styles.notice} data-error="true">{error}</p>}</div></SheetContent></Sheet>
  </main>
}
function message(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Retry without closing your report." }
function ReportCheckBadge({ checkedAt }: { checkedAt: string | null }) {
  return <Badge variant="outline" className={styles.checkBadge} data-checked={Boolean(checkedAt)}>{checkedAt ? <Check aria-hidden="true" /> : <Clock3 aria-hidden="true" />}{checkedAt ? "Checked" : "Not checked"}</Badge>
}
function VersionHistory({ reportId, initial, timezone, onOpen }: { reportId: string; initial: VersionSummary[]; timezone: string; onOpen: (id: string) => void }) {
  const [older, setOlder] = useState<VersionSummary[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState("")
  const versions = [...initial, ...older].filter((item, index, all) => all.findIndex(v => v.id === item.id) === index)
  const before = versions.at(-1)?.version_number ?? 1
  async function more() {
    setLoading(true); setError("")
    try { const result = await reportRequest<{ items: VersionSummary[] }>(`/api/reports?kind=versions&id=${reportId}&before=${before}`); setOlder(rows => [...rows, ...result.items]) }
    catch (e) { setError(message(e)) } finally { setLoading(false) }
  }
  return <div className={`${styles.card} mt-5`}><table className={styles.list}><caption className="sr-only">Submitted versions</caption><thead><tr><th>Version</th><th>Submitted</th><th>Status</th><th /></tr></thead><tbody>{versions.map(version => <tr key={version.id}><td>{version.version_number}</td><td>{new Date(version.submitted_at).toLocaleString("en", { timeZone: timezone })}</td><td>{reportVersionStatus(version)}</td><td><Button variant="ghost" size="sm" onClick={() => onOpen(version.id)}>View</Button></td></tr>)}</tbody></table>{before > 1 && <div className="p-3"><Button variant="outline" disabled={loading} onClick={() => void more()}>{loading ? "Loading…" : "Earlier versions"}</Button></div>}{error && <p role="alert" className={styles.notice}>{error}</p>}</div>
}
function displayWorkTime(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return "—"
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(`2000-01-01T${value}:00Z`))
}
function ReadEntries({ entries, sourceLinks }: { entries: ReportEntry[]; sourceLinks?: Record<string, string> }) {
  return <div className={styles.readRows}>{entries.map((entry, index) => <article className={styles.readRow} key={entry.id}>
    <div className={styles.readHeading}><span aria-hidden="true" className={styles.readNumber}>{index + 1}</span><h4>{entry.activity}</h4></div>
    <dl className={styles.readMeta}>
      <div><dt><Clock3 size={13} aria-hidden="true" />Time</dt><dd>{displayWorkTime(entry.start)} – {displayWorkTime(entry.end)}{entry.nextDay && <span className={styles.nextDayBadge}>+1 day</span>}</dd></div>
      <div><dt>Progress</dt><dd><strong>{entry.progress === null ? "—" : `${entry.progress}%`}</strong><div className={styles.bar} role="progressbar" aria-label={`Activity ${index + 1} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.progress ?? undefined} data-complete={entry.progress === 100}><i style={{ width: `${entry.progress ?? 0}%` }} /></div></dd></div>
    </dl>
    {entry.remarks && <div className={styles.readRemarks}><span>Remarks</span><p>{entry.remarks}</p></div>}
    {entry.sourceId && sourceLinks?.[entry.sourceId] && <a className={styles.readLink} href={sourceLinks[entry.sourceId]} target="_blank" rel="noopener noreferrer">Open linked work<ArrowUpRight size={13} aria-hidden="true" /></a>}
  </article>)}</div>
}
function ReportList({ kind, onOpen, onDate, refreshKey }: { kind: "history" | "team"; onOpen: (id: string) => void; onDate: (date: string) => void; refreshKey: number }) {
  const [items, setItems] = useState<(ReceivedReportSummary | HistoryItem)[]>([]), [page, setPage] = useState(0), [date, setDate] = useState("")
  const [author, setAuthor] = useState(""), [authors, setAuthors] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0)
  const [loadedKey, setLoadedKey] = useState("")
  const queryKey = `${kind}:${page}:${date}:${author}`
  const visibleItems = loadedKey === queryKey ? items : []
  useEffect(() => {
    const controller = new AbortController()
    void reportRequest<{ items: (ReceivedReportSummary | HistoryItem)[]; authors?: { id: string; display_name: string }[] }>(`/api/reports?kind=${kind}&page=${page}${date ? `&date=${date}` : ""}${author ? `&author=${author}` : ""}`, undefined, controller.signal)
      .then(result => { if (controller.signal.aborted) return; setItems(result.items); setLoadedKey(queryKey); setError(""); if (kind === "team") setAuthors((result.authors ?? []).map(item => ({ id: item.id, name: item.display_name }))) })
      .catch(e => { if (!controller.signal.aborted) setError(message(e)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [kind, page, date, author, queryKey, refresh, refreshKey])
  function filterDate(value: string) { setLoading(true); setPage(0); setDate(value) }
  return <section id={`reports-${kind}`} className={kind === "team" ? styles.teamInbox : undefined} role="tabpanel" aria-labelledby={`reports-tab-${kind}`}>
    <div className={styles.filters}>{kind === "team" && <><label className="sr-only" htmlFor="team-report-date">Filter date</label><input id="team-report-date" type="date" value={date} onChange={e => filterDate(e.target.value)} /><label className="sr-only" htmlFor="team-report-author">Filter employee</label><select id="team-report-author" value={author} onChange={e => { setLoading(true); setAuthor(e.target.value); setPage(0) }}><option value="">All employees</option>{authors.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></>}<Button variant="outline" onClick={() => { setLoading(true); setRefresh(r => r + 1) }} disabled={loading}><RefreshCw className={loading ? "animate-spin" : undefined} />Refresh</Button></div>
    {error && <p role="alert" className={styles.notice} data-error="true">{error}</p>}
    <div className={styles.card} aria-busy={loading}>{loading && !visibleItems.length ? <p role="status" className={styles.loading}>Loading reports…</p> : !visibleItems.length ? <p className={styles.empty}>{error ? "Reports could not be loaded." : "No reports found."}</p> : <table className={`${styles.list} ${kind === "team" ? styles.teamList : ""}`}><caption className="sr-only">{kind === "team" ? "Reports sent to you" : "Your report history"}</caption><thead><tr>{kind === "team" && <th scope="col">Employee</th>}<th scope="col">Date</th>{kind === "team" && <><th scope="col">Activity / time</th><th scope="col">Progress</th></>}<th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{visibleItems.map(item => <tr key={item.id}>
      {"author_name" in item && <td data-label="Employee">{item.author_name}</td>}
      <td data-label="Date">{item.report_date}{"timezone" in item && <small className={styles.listZone}>{item.timezone.replace(/_/g, " ")}</small>}</td>
      {"author_name" in item && <>
        <td data-label="Activity / time"><div className={styles.sessionList}>{(item.activityPreview ?? []).map(entry => <div key={entry.id} className={styles.session}>
          <strong className={styles.sessionTitle} title={entry.activity}>{entry.activity}</strong>
          <span className={styles.sessionTime}>{displayWorkTime(entry.start)} – {displayWorkTime(entry.end)}{entry.nextDay && <span className={styles.nextDayBadge}>+1 day</span>}</span>
        </div>)}</div>{item.hasMoreActivities && <small className={styles.moreActivities}>More activities in View</small>}</td>
        <td data-label="Progress"><div className={styles.sessionList}>{(item.activityPreview ?? []).map(entry => <div key={entry.id} className={styles.session}>
          <strong>{entry.progress === null ? "—" : `${entry.progress}%`}</strong>
          <div className={styles.bar} role="progressbar" aria-label={`${item.author_name}: ${entry.activity} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.progress ?? undefined} data-complete={entry.progress === 100}><i style={{ width: `${entry.progress ?? 0}%` }} /></div>
        </div>)}</div></td>
      </>}
      <td data-label="Status">{"draft_open" in item ? item.draft_open ? item.latest_version ? "Correction draft" : "Draft" : item.checked_at ? "Checked" : "Submitted" : <><ReportCheckBadge checkedAt={item.checked_at} />{!item.is_latest && <small className={styles.listZone}>Earlier version</small>}</>}</td>
      <td><Button size="sm" variant="ghost" className={kind === "team" ? styles.viewReport : undefined} disabled={loading} onClick={() => "draft_open" in item ? onDate(item.report_date) : onOpen(item.id)}><Eye aria-hidden="true" />View</Button></td>
    </tr>)}</tbody></table>}</div>
    <div className={`${styles.actions} mt-4`}><Button variant="outline" disabled={loading || page === 0} onClick={() => { setLoading(true); setPage(p => p - 1) }}>Previous</Button><span className={styles.muted}>Page {page + 1}</span><Button variant="outline" disabled={loading || visibleItems.length < 30} onClick={() => { setLoading(true); setPage(p => p + 1) }}>Next</Button></div>
  </section>
}
