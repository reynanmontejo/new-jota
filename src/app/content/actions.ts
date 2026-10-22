"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const statuses = ["idea", "planned", "in_production", "for_review", "revision_requested", "waiting_client", "scheduled", "published", "rejected", "cancelled"] as const
const approvals = ["pending", "approved", "revision_requested", "rejected"] as const
const clientResponses = ["approved", "revision_requested", "rejected"] as const
const schema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  campaignId: z.union([z.string().uuid(), z.literal("")]),
  title: z.string().trim().min(2).max(200),
  platform: z.string().trim().min(2).max(60),
  contentType: z.string().trim().min(2).max(80),
  description: z.string().max(5000),
  status: z.enum(statuses),
  workDate: z.string().optional(),
  deadlineAt: z.string().optional(),
  publishAt: z.string().optional(),
  notes: z.string().max(5000),
  nextAction: z.string().max(500),
  revisionNotes: z.string().max(5000),
  assignedTo: z.union([z.string().uuid(), z.literal("")]).optional(),
})

function field(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === "string" ? value : ""
}

function validDate(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function validDateOnly(value: string) {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined
}

export async function saveContentItem(formData: FormData) {
  const parsed = schema.safeParse({
    id: field(formData, "id") || undefined,
    clientId: field(formData, "clientId"),
    campaignId: field(formData, "campaignId"),
    title: field(formData, "title"),
    platform: field(formData, "platform"),
    contentType: field(formData, "contentType"),
    description: field(formData, "description"),
    status: field(formData, "status"),
    workDate: field(formData, "workDate"),
    deadlineAt: field(formData, "deadlineAt"),
    publishAt: field(formData, "publishAt"),
    notes: field(formData, "notes"),
    nextAction: field(formData, "nextAction"),
    revisionNotes: field(formData, "revisionNotes"),
    assignedTo: field(formData, "assignedTo"),
  })
  if (!parsed.success) redirect("/content?notice=invalid")
  const publishAt = validDate(parsed.data.publishAt ?? "")
  const workDate = validDateOnly(parsed.data.workDate ?? "")
  const deadlineAt = validDateOnly(parsed.data.deadlineAt ?? "")
  if (publishAt === undefined || workDate === undefined || deadlineAt === undefined) redirect("/content?notice=invalid")

  const supabase = await createClient()
  let existingClientApprovalStatus: string | null = null
  let existingClientIssues: string | null = null
  if (parsed.data.id) {
    const { data: existingItem, error: existingItemError } = await supabase.from("content_items")
      .select("client_approval_status,client_issues")
      .eq("id", parsed.data.id)
      .is("deleted_at", null)
      .maybeSingle()
    if (existingItemError || !existingItem) redirect("/content?notice=failed")
    existingClientApprovalStatus = existingItem.client_approval_status
    existingClientIssues = existingItem.client_issues
  }
  let campaignId = parsed.data.campaignId
  if (!campaignId) {
    const { data, error } = await supabase.rpc("ensure_default_campaign_for_current_user", { p_client_id: parsed.data.clientId })
    if (error?.code === "42501") redirect("/content?notice=forbidden")
    if (error?.code === "PGRST202") redirect("/content?notice=content_migration_missing")
    if (error?.code === "22023") redirect("/content?notice=campaign_paused")
    if (error || typeof data !== "string") redirect("/content?notice=failed")
    campaignId = data
  }
  const result = parsed.data.id
    ? await supabase.rpc("update_content_tracker_item_for_current_user", {
      p_content_id: parsed.data.id,
      p_client_id: parsed.data.clientId,
      p_campaign_id: campaignId,
      p_title: parsed.data.title,
      p_platform: parsed.data.platform,
      p_content_type: parsed.data.contentType,
      p_description: parsed.data.description || null,
      p_status: parsed.data.status,
      p_work_date: workDate,
      p_deadline_at: deadlineAt,
      p_publish_at: publishAt,
      p_client_approval_status: existingClientApprovalStatus,
      p_client_issues: existingClientIssues,
      p_notes: parsed.data.notes || null,
      p_next_action: parsed.data.nextAction || null,
      p_revision_notes: parsed.data.revisionNotes || null,
      p_assigned_to: parsed.data.assignedTo || null,
    })
    : await supabase.rpc("create_content_tracker_item_for_current_user", {
      p_client_id: parsed.data.clientId,
      p_campaign_id: campaignId,
      p_title: parsed.data.title,
      p_platform: parsed.data.platform,
      p_content_type: parsed.data.contentType,
      p_description: parsed.data.description || null,
      p_status: parsed.data.status,
      p_work_date: workDate,
      p_deadline_at: deadlineAt,
      p_publish_at: publishAt,
      p_client_approval_status: null,
      p_client_issues: null,
      p_notes: parsed.data.notes || null,
      p_next_action: parsed.data.nextAction || null,
      p_assigned_to: parsed.data.assignedTo || null,
    })

  if (result.error?.code === "42501") redirect("/content?notice=forbidden")
  if (result.error?.code === "PGRST202") redirect("/content?notice=content_migration_missing")
  if (result.error?.code === "23514") redirect("/content?notice=campaign_paused")
  if (result.error?.code === "22023") redirect("/content?notice=invalid")
  if (result.error) redirect("/content?notice=failed")
  revalidatePath("/content")
  revalidatePath("/calendar")
  redirect(`/content?notice=${parsed.data.id ? "updated" : "created"}`)
}

export async function setContentCategory(formData: FormData) {
  const contentId = z.string().uuid().safeParse(field(formData, "contentItemId"))
  const category = z.enum(["auto", "static", "video", "other"]).safeParse(field(formData, "category"))
  if (!contentId.success || !category.success) redirect("/content?notice=invalid")

  const supabase = await createClient()
  const { error } = await supabase.rpc("set_content_category_for_current_user", {
    p_content_id: contentId.data,
    p_category: category.data,
  })
  if (error?.code === "42501") redirect("/content?notice=forbidden")
  if (error?.code === "PGRST202") redirect("/content?notice=content_reporting_migration_missing")
  if (error?.code === "P0002") redirect("/content?notice=content_not_found")
  if (error) redirect("/content?notice=failed")

  revalidatePath("/content")
  revalidatePath("/insights")
  redirect(`/content?notice=category_updated#content-item-${contentId.data}`)
}

export async function sendApprovedContentToClient(formData: FormData) {
  const parsed = z.string().uuid().safeParse(field(formData, "contentItemId"))
  if (!parsed.success) redirect("/content?notice=invalid")

  const supabase = await createClient()
  const { error } = await supabase.rpc("send_approved_content_to_client", { p_content_item_id: parsed.data })
  if (error?.code === "42501") redirect("/content?notice=forbidden")
  if (error?.code === "P0002") redirect("/content?notice=content_not_found")
  if (error?.code === "PGRST202") redirect("/content?notice=client_handoff_migration_missing")
  if (error?.code === "22023") redirect("/content?notice=client_handoff_not_ready")
  if (error) redirect("/content?notice=failed")

  revalidatePath("/content")
  revalidatePath("/calendar")
  revalidatePath("/tasks")
  redirect(`/content?notice=client_handoff_recorded#content-item-${encodeURIComponent(parsed.data)}`)
}

export async function recordExternalClientDecision(formData: FormData) {
  const parsed = z.object({
    contentItemId: z.string().uuid(),
    decision: z.enum(clientResponses),
    feedback: z.string().trim().max(5000),
  }).safeParse({
    contentItemId: field(formData, "contentItemId"),
    decision: field(formData, "decision"),
    feedback: field(formData, "feedback"),
  })
  if (!parsed.success || (parsed.data.decision === "revision_requested" && !parsed.data.feedback)) {
    redirect("/content?notice=client_decision_invalid")
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("record_external_client_decision", {
    p_content_item_id: parsed.data.contentItemId,
    p_decision: parsed.data.decision,
    p_feedback: parsed.data.feedback || null,
  })
  if (error?.code === "42501") redirect("/content?notice=forbidden")
  if (error?.code === "P0002") redirect("/content?notice=content_not_found")
  if (error?.code === "PGRST202") redirect("/content?notice=client_workflow_migration_missing")
  if (error?.code === "22023") redirect("/content?notice=client_decision_invalid")
  if (error) redirect("/content?notice=failed")

  revalidatePath("/content")
  revalidatePath("/calendar")
  revalidatePath("/tasks")
  revalidatePath("/reviews")
  revalidatePath("/")
  redirect(`/content?notice=client_decision_updated#content-item-${encodeURIComponent(parsed.data.contentItemId)}`)
}

type ContentArchiveActionResult = { ok: true } | { ok: false; error: string }

function contentArchiveError(message: string, code?: string) {
  if (code === "42501") return "You don’t have permission to manage this content."
  if (code === "P0002") return "This content was already archived or is no longer available. Refresh and try again."
  if (code === "PGRST202") return "Apply the content archive restore migration in Supabase, then try again."
  console.error("Content archive action failed", { code, message })
  return "The change could not be saved. Check your connection and try again."
}

export async function archiveContentItem(contentId: string): Promise<ContentArchiveActionResult> {
  const id = z.string().uuid().safeParse(contentId)
  if (!id.success) return { ok: false, error: "This content item is invalid. Refresh and try again." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("archive_content_item_for_current_user", { p_content_id: id.data })
  if (error) return { ok: false, error: contentArchiveError(error.message, error.code) }
  revalidatePath("/content")
  revalidatePath("/calendar")
  revalidatePath("/tasks")
  revalidatePath("/")
  return { ok: true }
}

export async function restoreContentItem(contentId: string): Promise<ContentArchiveActionResult> {
  const id = z.string().uuid().safeParse(contentId)
  if (!id.success) return { ok: false, error: "This content item is invalid. Refresh and try again." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("restore_content_item_for_current_user", { p_content_id: id.data })
  if (error) return { ok: false, error: contentArchiveError(error.message, error.code) }
  revalidatePath("/content")
  revalidatePath("/calendar")
  revalidatePath("/tasks")
  revalidatePath("/")
  return { ok: true }
}

export async function markScheduledContentPublished(contentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsedId = z.string().uuid().safeParse(contentId)
  if (!parsedId.success) return { ok: false, error: "Content item not found." }

  const supabase = await createClient()
  const { data: item, error: loadError } = await supabase.from("content_items")
    .select("id,client_id,campaign_id,title,platform,content_type,description,status,work_date,deadline_at,publish_at,client_approval_status,client_issues,notes,next_action,revision_notes,assigned_to")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .maybeSingle()
  if (loadError || !item) return { ok: false, error: "Could not find this content item or you do not have access to it." }
  if (item.status !== "scheduled") return { ok: false, error: "Only scheduled content can be marked as published." }

  const { error } = await supabase.rpc("update_content_tracker_item_for_current_user", {
    p_content_id: item.id,
    p_client_id: item.client_id,
    p_campaign_id: item.campaign_id,
    p_title: item.title,
    p_platform: item.platform,
    p_content_type: item.content_type,
    p_description: item.description,
    p_status: "published",
    p_work_date: item.work_date,
    p_deadline_at: item.deadline_at,
    p_publish_at: item.publish_at,
    p_client_approval_status: item.client_approval_status,
    p_client_issues: item.client_issues,
    p_notes: item.notes,
    p_next_action: "Published",
    p_revision_notes: item.revision_notes,
    p_assigned_to: item.assigned_to,
  })
  if (error?.code === "42501") return { ok: false, error: "You do not have permission to update this content." }
  if (error) return { ok: false, error: "The content could not be marked as published. Please try again." }

  revalidatePath("/tasks")
  revalidatePath("/content")
  revalidatePath("/calendar")
  return { ok: true }
}

const importRowSchema = z.object({
  client_id: z.string().uuid(),
  campaign_id: z.union([z.string().uuid(), z.literal("")]),
  title: z.string().min(2).max(200),
  platform: z.string().min(2).max(60),
  content_type: z.string().min(2).max(80),
  description: z.string().max(5000).nullable(),
  status: z.enum(statuses),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => validDateOnly(value) !== undefined).nullable(),
  deadline_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => validDateOnly(value) !== undefined).nullable(),
  publish_at: z.string().datetime({ offset: true }).nullable(),
  client_approval_status: z.enum(approvals).nullable(),
  client_issues: z.string().max(5000).nullable(),
  revision_count: z.number().int().min(0).max(10000),
  notes: z.string().max(5000).nullable(),
  next_action: z.string().max(500).nullable(),
  revision_notes: z.string().max(5000).nullable(),
  assigned_to: z.string().uuid().nullable(),
})

export async function importContentItems(formData: FormData) {
  const serialized = field(formData, "rows")
  if (serialized.length > 700_000) redirect("/content?notice=import_too_large")
  let rawRows: unknown
  try { rawRows = JSON.parse(serialized) } catch { redirect("/content?notice=invalid_import") }
  const parsed = z.array(importRowSchema).min(1).max(250).safeParse(rawRows)
  if (!parsed.success) redirect("/content?notice=invalid_import")

  const supabase = await createClient()
  const defaultCampaignIds = new Map<string, string>()
  for (const clientId of new Set(parsed.data.filter((row) => !row.campaign_id).map((row) => row.client_id))) {
    const { data: campaignId, error: campaignError } = await supabase.rpc("ensure_default_campaign_for_current_user", { p_client_id: clientId })
    if (campaignError?.code === "42501") redirect("/content?notice=forbidden")
    if (campaignError?.code === "PGRST202") redirect("/content?notice=content_migration_missing")
    if (campaignError?.code === "22023") redirect("/content?notice=campaign_paused")
    if (campaignError || typeof campaignId !== "string") redirect("/content?notice=failed")
    defaultCampaignIds.set(clientId, campaignId)
  }
  const rows = parsed.data.map((row) => ({ ...row, campaign_id: row.campaign_id || defaultCampaignIds.get(row.client_id)! }))
  const { data, error } = await supabase.rpc("import_content_items_for_current_user", { p_rows: rows })
  if (error?.code === "42501") redirect("/content?notice=forbidden")
  if (error?.code === "23514") redirect("/content?notice=campaign_paused")
  if (error?.code === "22023") redirect("/content?notice=invalid_import")
  if (error?.code === "PGRST202") redirect("/content?notice=content_migration_missing")
  if (error) redirect("/content?notice=failed")
  const result = data as { created?: number; duplicates?: number } | null
  const createdValue = result?.created
  const duplicateValue = result?.duplicates
  const created = typeof createdValue === "number" && Number.isInteger(createdValue) ? createdValue : 0
  const duplicates = typeof duplicateValue === "number" && Number.isInteger(duplicateValue) ? duplicateValue : 0
  revalidatePath("/content")
  revalidatePath("/calendar")
  redirect(`/content?notice=imported&added=${created}&duplicates=${duplicates}`)
}
