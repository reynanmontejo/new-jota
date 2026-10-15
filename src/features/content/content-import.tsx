"use client"

import { useMemo, useState } from "react"
import { Download } from "lucide-react"

import { importContentItems } from "@/app/content/actions"
import type { TrackerAssignee, TrackerCampaign, TrackerClient, TrackerItem } from "@/features/content/content-tracker"
import { ContentSubmitButton } from "@/features/content/content-submit-button"
import { contentImportFields, detectContentImportMapping, detectSocialCalendarMapping, normalizeImportValue, parseContentImportCount, parseContentImportDate, parseContentImportDateOnly, readClientApprovalStatus, readContentImportStatus, type ContentImportStatus, type ImportField } from "@/features/content/content-import-utils"

type RowInput = { client_id: string; campaign_id: string; title: string; platform: string; content_type: string; description: string | null; status: ContentImportStatus; work_date: string | null; deadline_at: string | null; publish_at: string | null; client_approval_status: "pending" | "approved" | "revision_requested" | "rejected" | null; client_issues: string | null; revision_count: number; notes: string | null; next_action: string | null; revision_notes: string | null; assigned_to: string | null }
type PreviewRow = { number: number; values: RowInput | null; duplicate: boolean; error?: string }

const fields = contentImportFields
const normalize = normalizeImportValue
const canReceiveNewContent = (campaign: TrackerCampaign) => campaign.status === "active" || campaign.status === "draft"

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const input = text.replace(/^\uFEFF/, "")
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index += 1 }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ",") { row.push(cell); cell = "" }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1
      row.push(cell); cell = ""
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
    } else cell += char
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted cell.")
  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  if (rows.length < 2) throw new Error("Choose a CSV with a header row and at least one content row.")
  return rows
}

const fieldClass = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"

export function ContentImport({ clients, campaigns, assignees, items, currentUserId, canAssignContent }: { clients: TrackerClient[]; campaigns: TrackerCampaign[]; assignees: Record<string, TrackerAssignee[]>; items: TrackerItem[]; currentUserId: string; canAssignContent: boolean }) {
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Partial<Record<ImportField, string>>>({})
  const [defaultClient, setDefaultClient] = useState("")
  const [defaultCampaign, setDefaultCampaign] = useState("")
  const [defaultPlatform, setDefaultPlatform] = useState("")
  const [defaultFormat, setDefaultFormat] = useState("")
  const [defaultAssignee, setDefaultAssignee] = useState("")
  const [fileName, setFileName] = useState("")
  const [error, setError] = useState("")
  const isSocialCalendar = Boolean(detectSocialCalendarMapping(headers))
  const defaultClientCampaigns = campaigns.filter((campaign) => campaign.client_id === defaultClient && canReceiveNewContent(campaign))
  const resolvedDefaultCampaign = defaultClientCampaigns.some((campaign) => campaign.id === defaultCampaign)
    ? defaultCampaign
    : defaultClientCampaigns.find((campaign) => campaign.name.toLocaleLowerCase() === "general / ongoing")?.id ?? ""

  const preview = useMemo<PreviewRow[]>(() => {
    const seen = new Set<string>()
    return rows.map((row, rowIndex) => {
      const value = (field: ImportField) => {
        const column = mapping[field]
        return column === undefined || column === "" ? "" : row[Number(column)]?.trim() ?? ""
      }
      const resolveClient = (name: string) => clients.filter((client) => normalize(client.name) === normalize(name))
      const resolvedClients = value("client") ? resolveClient(value("client")) : clients.filter((client) => client.id === defaultClient)
      if (resolvedClients.length !== 1) return { number: rowIndex + 2, values: null, duplicate: false, error: value("client") ? `Client “${value("client") || "(blank)"}” does not match exactly one workspace client.` : "Choose a default client or map a client column." }
      const client = resolvedClients[0]
      const candidates = campaigns.filter((campaign) => campaign.client_id === client.id && canReceiveNewContent(campaign))
      const fallbackCampaignId = candidates.some((campaign) => campaign.id === defaultCampaign)
        ? defaultCampaign
        : candidates.find((campaign) => campaign.name.toLocaleLowerCase() === "general / ongoing")?.id ?? ""
      const campaignValue = value("campaign")
      const resolvedCampaigns = campaignValue ? candidates.filter((campaign) => normalize(campaign.name) === normalize(campaignValue)) : []
      if (campaignValue && resolvedCampaigns.length !== 1) return { number: rowIndex + 2, values: null, duplicate: false, error: `Campaign “${campaignValue}” doesn’t match an active campaign for ${client.name}.` }
      const campaignId = resolvedCampaigns[0]?.id ?? fallbackCampaignId
      const title = value("title")
      if (title.length < 2) return { number: rowIndex + 2, values: null, duplicate: false, error: "Content title is required." }
      const platform = value("platform") || defaultPlatform.trim()
      const contentType = value("contentType") || defaultFormat.trim()
      const missingDetails = [
        platform.length < 2 ? "Choose the platform for these posts, or add a Platform column." : "",
        contentType.length < 2 ? "Choose a default format, or map a Format column." : "",
      ].filter(Boolean).join(" ")
      const rawStatus = value("status")
      const status = rawStatus ? readContentImportStatus(rawStatus) : "planned"
      if (!status) return { number: rowIndex + 2, values: null, duplicate: false, error: `Status “${rawStatus}” has no safe match in the current tracker. It was not imported because mapping it would lose workflow meaning.` }
      const readDateField = (field: "workDate" | "deadlineAt", label: string) => {
        const raw = value(field)
        const parsed = raw ? parseContentImportDate(raw) : null
        return { raw, parsed, error: raw && !parsed ? `${label} “${raw}” isn’t recognized. Use a date containing a year.` : "" }
      }
      const workDate = readDateField("workDate", "Work date")
      if (workDate.error) return { number: rowIndex + 2, values: null, duplicate: false, error: workDate.error }
      const deadline = readDateField("deadlineAt", "Deadline")
      if (deadline.error) return { number: rowIndex + 2, values: null, duplicate: false, error: deadline.error }
      const publishRaw = value("publishAt")
      const parsedDate = publishRaw ? parseContentImportDate(publishRaw) : null
      if (publishRaw && !parsedDate) return { number: rowIndex + 2, values: null, duplicate: false, error: `Publish date “${publishRaw}” isn’t recognized. Use a date or date range containing a year.` }
      const approvalRaw = value("clientApprovalStatus")
      const approvalStatus = approvalRaw ? readClientApprovalStatus(approvalRaw) : null
      if (approvalRaw && !approvalStatus && !["none", "n/a", "na", "not applicable"].includes(normalize(approvalRaw))) return { number: rowIndex + 2, values: null, duplicate: false, error: `Client approval “${approvalRaw}” isn’t recognized. Nothing will be imported until it is mapped to a supported value.` }
      const revisionRaw = value("revisionCount")
      const revisionCount = parseContentImportCount(revisionRaw)
      if (revisionCount === null) return { number: rowIndex + 2, values: null, duplicate: false, error: `Revision count “${revisionRaw}” must be a whole number from 0 to 10,000.` }
      const ownerName = value("assignee")
      const ownerId = ownerName
        ? (assignees[client.id] ?? []).find((person) => normalize(person.display_name) === normalize(ownerName))?.id
        : canAssignContent ? defaultAssignee : currentUserId
      const matchedOwners = ownerId ? (assignees[client.id] ?? []).filter((person) => person.id === ownerId) : []
      if (ownerName && matchedOwners.length !== 1) return { number: rowIndex + 2, values: null, duplicate: false, error: `Responsible person “${ownerName}” isn’t an active member of ${client.name}.` }
      if (!ownerName && !ownerId) return { number: rowIndex + 2, values: null, duplicate: false, error: "Choose an assigned creator/editor or map that column." }
      if (ownerId && matchedOwners.length !== 1) return { number: rowIndex + 2, values: null, duplicate: false, error: `The selected responsible person is not an active member of ${client.name}.` }
      const values: RowInput = {
        client_id: client.id,
        campaign_id: campaignId,
        title,
        platform,
        content_type: contentType,
        description: isSocialCalendar && value("description") ? `Content focus: ${value("description")}` : value("description") || null,
        status,
        work_date: workDate.parsed ? parseContentImportDateOnly(workDate.raw) : null,
        deadline_at: deadline.parsed ? parseContentImportDateOnly(deadline.raw) : null,
        publish_at: parsedDate?.toISOString() ?? null,
        client_approval_status: approvalStatus,
        client_issues: value("clientIssues") || null,
        revision_count: revisionCount,
        notes: isSocialCalendar && value("notes") ? `Source calendar status: ${value("notes")}` : value("notes") || null,
        next_action: value("nextAction") || null,
        revision_notes: value("revisionNotes") || null,
        assigned_to: matchedOwners[0].id,
      }
      const key = `${values.client_id}|${values.campaign_id}|${normalize(values.title)}|${normalize(values.platform)}|${values.publish_at ?? ""}`
      const duplicate = seen.has(key) || items.some((item) => item.client_id === values.client_id && item.campaign_id === values.campaign_id && normalize(item.title) === normalize(values.title) && normalize(item.platform) === normalize(values.platform) && item.publish_at === values.publish_at)
      seen.add(key)
      return { number: rowIndex + 2, values, duplicate, ...(missingDetails ? { error: missingDetails } : {}) }
    })
  }, [rows, mapping, clients, campaigns, defaultClient, defaultCampaign, defaultPlatform, defaultFormat, defaultAssignee, currentUserId, canAssignContent, assignees, items, isSocialCalendar])

  const validRows = preview.filter((row) => row.values && !row.error && !row.duplicate).map((row) => row.values!)
  const duplicateCount = preview.filter((row) => row.duplicate).length
  const invalidCount = preview.filter((row) => row.error).length

  async function loadFile(file?: File) {
    if (!file) return
    setError("")
    setFileName(file.name)
    if (file.size > 1_000_000) { setError("CSV file must be 1 MB or smaller."); setRows([]); return }
    try {
      const parsed = parseCsv(await file.text())
      const detectedHeaders = parsed[0].map((header, index) => header.trim() || `Column ${index + 1}`)
      const calendarMapping = detectSocialCalendarMapping(detectedHeaders)
      const initialMapping = calendarMapping
        ? { ...detectContentImportMapping(detectedHeaders), ...calendarMapping }
        : detectContentImportMapping(detectedHeaders)
      const singleClient = clients.length === 1 ? clients[0] : null
      const singleClientCampaigns = singleClient ? campaigns.filter((campaign) => campaign.client_id === singleClient.id) : []
      setHeaders(detectedHeaders)
      setRows(parsed.slice(1).slice(0, 250))
      setMapping(initialMapping)
      setDefaultClient(singleClient?.id ?? "")
      setDefaultCampaign(singleClientCampaigns.find((campaign) => canReceiveNewContent(campaign) && campaign.name.toLocaleLowerCase() === "general / ongoing")?.id ?? "")
      setDefaultPlatform("")
      setDefaultFormat("")
      const singleClientAssignees = singleClient ? assignees[singleClient.id] ?? [] : []
      setDefaultAssignee(canAssignContent && singleClientAssignees.length !== 1 ? "" : canAssignContent ? singleClientAssignees[0]?.id ?? "" : currentUserId)
      if (parsed.length - 1 > 250) setError("Only the first 250 rows are included. Split larger sheets into separate imports.")
    } catch (caught) {
      setHeaders([]); setRows([])
      setError(caught instanceof Error ? caught.message : "The CSV file couldn’t be read.")
    }
  }

  const mappingControls = <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{fields.map((field) => <label key={field.id} className="grid gap-1 text-[11px] font-medium text-muted-foreground">{field.label}{field.required && <span className="sr-only"> required</span>}<select className={fieldClass} value={mapping[field.id] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [field.id]: event.target.value }))}><option value="">{field.required ? "Choose column or default" : "Not mapped"}</option>{headers.map((header, index) => <option key={`${index}-${header}`} value={index}>{header}</option>)}</select></label>)}</div>

  const contextControls = <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    {!mapping.client && <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">{isSocialCalendar ? "Client for all posts" : "Default client"}<select className={fieldClass} value={defaultClient} onChange={(event) => { const nextClient = event.target.value; const nextCampaigns = campaigns.filter((campaign) => campaign.client_id === nextClient && canReceiveNewContent(campaign)); const nextAssignees = assignees[nextClient] ?? []; setDefaultClient(nextClient); setDefaultCampaign(nextCampaigns.find((campaign) => campaign.name.toLocaleLowerCase() === "general / ongoing")?.id ?? ""); setDefaultAssignee(canAssignContent ? nextAssignees.length === 1 ? nextAssignees[0].id : "" : currentUserId) }}><option value="">Choose client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>}
    {!mapping.campaign && <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">{isSocialCalendar ? "Campaign (optional)" : "Default campaign (optional)"}<select className={fieldClass} value={resolvedDefaultCampaign} onChange={(event) => setDefaultCampaign(event.target.value)} disabled={!defaultClient}><option value="">General / Ongoing (automatic)</option>{defaultClientCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>}
    {!mapping.assignee && canAssignContent && <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">Assigned creator / editor<select className={fieldClass} value={defaultAssignee} onChange={(event) => setDefaultAssignee(event.target.value)} disabled={!defaultClient}><option value="">Choose a creator/editor</option>{(assignees[defaultClient] ?? []).map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select>{!defaultClient && <span className="font-normal">For CSVs covering multiple clients, map an Assigned creator/editor column.</span>}</label>}
    {!canAssignContent && <p className="self-end pb-2 text-[11px] text-muted-foreground">Unless specified in the CSV, posts will show you as the assigned creator/editor. My Work is based on your client access.</p>}
    {!mapping.platform && <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">{isSocialCalendar ? "Platform for all posts" : "Default platform"}<input className={fieldClass} value={defaultPlatform} onChange={(event) => setDefaultPlatform(event.target.value)} placeholder="e.g. Instagram" maxLength={60} />{isSocialCalendar && <span className="font-normal">Your CSV has no Platform column, so this will be used for each post.</span>}</label>}
    {!isSocialCalendar && !mapping.contentType && <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">Default format<input className={fieldClass} value={defaultFormat} onChange={(event) => setDefaultFormat(event.target.value)} placeholder="e.g. Reel" /></label>}
  </div>

  const socialCalendarPreview = <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[680px] text-left text-[11px]"><thead className="bg-muted/45 text-muted-foreground"><tr><th className="px-2.5 py-2">Date</th><th className="px-2.5 py-2">Content idea</th><th className="px-2.5 py-2">Focus</th><th className="px-2.5 py-2">Format</th><th className="px-2.5 py-2">Check</th></tr></thead><tbody className="divide-y">{preview.slice(0, 6).map((row) => <tr key={row.number}><td className="whitespace-nowrap px-2.5 py-2">{row.values?.publish_at ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(row.values.publish_at)) : "—"}</td><td className="max-w-56 truncate px-2.5 py-2">{row.values?.title ?? "—"}</td><td className="px-2.5 py-2">{row.values?.description?.replace(/^Content focus: /, "") ?? "—"}</td><td className="px-2.5 py-2">{row.values?.content_type ?? "—"}</td><td className="px-2.5 py-2">{row.error ? <span className="text-destructive">{row.error}</span> : row.duplicate ? "Duplicate — skipped" : "Ready"}</td></tr>)}</tbody></table>{preview.length > 6 && <p className="border-t px-2.5 py-2 text-[10px] text-muted-foreground">Showing 6 of {preview.length}; all rows are checked before import.</p>}</div>

  return <details className="mt-3 rounded-lg border border-border bg-card/65 p-3">
    <summary className="cursor-pointer list-none text-xs font-semibold text-primary [&::-webkit-details-marker]:hidden">Import from CSV</summary>
    <div className="mt-3 grid gap-3 border-t pt-3">
      <p className="text-[11px] text-muted-foreground">Choose a CSV, check the preview, then import up to 250 content items. Existing duplicates are skipped.</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <a href="/content-import-template.xlsx" download="jota-content-import-template.xlsx" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/20 bg-background/70 px-2.5 font-medium text-primary transition hover:bg-primary/5"><Download className="size-3.5" />Download Excel template</a>
        <span className="text-muted-foreground">Includes an AI prompt and a clean import sheet.</span>
      </div>
      <label className="grid gap-1.5 text-[11px] font-medium">CSV file<input className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-secondary/40 file:px-2.5 file:py-1.5 file:text-xs file:font-medium" type="file" accept=".csv,text/csv" onChange={(event) => void loadFile(event.target.files?.[0])} />{fileName && <span className="font-normal text-muted-foreground">{fileName}</span>}</label>
      {error && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
      {!!headers.length && <>
        {isSocialCalendar && <div className="rounded-lg border border-primary/20 bg-secondary/20 px-3 py-2.5 text-xs"><p className="font-semibold text-foreground">Calendar detected · {rows.length} posts</p><p className="mt-1 leading-5 text-muted-foreground">Date sets the publish date, Content Idea becomes the title, and Format is mapped automatically. Type/Focus and source status are kept in notes. New items start as Planned. Choose a platform below because this file does not include one.</p></div>}
        <details className="rounded-md border border-border/70 bg-background/40 px-3 py-2"><summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">{isSocialCalendar ? "Adjust column matching" : "Advanced column mapping"} <span className="font-normal">(only if the preview looks wrong)</span></summary><div className="mt-3 border-t pt-3">{mappingControls}</div></details>
        {contextControls}
        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground"><span>{preview.length} rows scanned</span><span>{validRows.length} ready to import</span><span>{duplicateCount} duplicates skipped</span><span>{invalidCount} rows need correction</span></div>
        {isSocialCalendar && socialCalendarPreview}
        {!isSocialCalendar && (
        <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[680px] text-left text-[11px]"><thead className="bg-muted/45 text-muted-foreground"><tr><th className="px-2.5 py-2">Row</th><th className="px-2.5 py-2">Content</th><th className="px-2.5 py-2">Client / campaign</th><th className="px-2.5 py-2">Platform · format</th><th className="px-2.5 py-2">Preview check</th></tr></thead><tbody className="divide-y">{preview.slice(0, 6).map((row) => <tr key={row.number}><td className="px-2.5 py-2">{row.number}</td><td className="max-w-48 truncate px-2.5 py-2">{row.values?.title ?? "—"}</td><td className="px-2.5 py-2">{row.values ? `${clients.find((client) => client.id === row.values?.client_id)?.name} / ${campaigns.find((campaign) => campaign.id === row.values?.campaign_id)?.name ?? "General / Ongoing"}` : "—"}</td><td className="px-2.5 py-2">{row.values ? `${row.values.platform} · ${row.values.content_type}` : "—"}</td><td className="px-2.5 py-2">{row.error ? <span className="text-destructive">{row.error}</span> : row.duplicate ? "Duplicate — skipped" : "Ready"}</td></tr>)}</tbody></table>{preview.length > 6 && <p className="border-t px-2.5 py-2 text-[10px] text-muted-foreground">Showing 6 of {preview.length}; all rows are validated before import.</p>}</div>
        )}
        <form action={importContentItems} className="flex flex-wrap items-center justify-between gap-2">
          <input type="hidden" name="rows" value={JSON.stringify(validRows)} />
          <p className="text-[10px] text-muted-foreground">Each row creates one content item for Content and Calendar. Import does not create tasks automatically; use Add task on a content card when assigned work should appear in My Work.</p>
          <ContentSubmitButton pendingLabel="Adding to tracker…" disabled={!validRows.length || invalidCount > 0}>{isSocialCalendar ? `Add ${validRows.length} post${validRows.length === 1 ? "" : "s"} to tracker` : `Import ${validRows.length} row${validRows.length === 1 ? "" : "s"}`}</ContentSubmitButton>
        </form>
      </>}
    </div>
  </details>
}
