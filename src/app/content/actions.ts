"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const statuses = ["idea", "planned", "in_production", "for_review", "revision_requested", "waiting_client", "scheduled", "published", "rejected", "cancelled"] as const
const approvals = ["pending", "approved", "revision_requested", "rejected"] as const
const schema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  campaignId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  platform: z.string().trim().min(2).max(60),
  contentType: z.string().trim().min(2).max(80),
  description: z.string().max(5000),
  status: z.enum(statuses),
  workDate: z.string().optional(),
  deadlineAt: z.string().optional(),
  publishAt: z.string().optional(),
  clientApprovalStatus: z.union([z.enum(approvals), z.literal("")]).optional(),
  clientIssues: z.string().max(5000),
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
    clientApprovalStatus: field(formData, "clientApprovalStatus"),
    clientIssues: field(formData, "clientIssues"),
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
  const result = parsed.data.id
    ? await supabase.rpc("update_content_tracker_item_for_current_user", {
      p_content_id: parsed.data.id,
      p_client_id: parsed.data.clientId,
      p_campaign_id: parsed.data.campaignId,
      p_title: parsed.data.title,
      p_platform: parsed.data.platform,
      p_content_type: parsed.data.contentType,
      p_description: parsed.data.description || null,
      p_status: parsed.data.status,
      p_work_date: workDate,
      p_deadline_at: deadlineAt,
      p_publish_at: publishAt,
      p_client_approval_status: parsed.data.clientApprovalStatus || null,
      p_client_issues: parsed.data.clientIssues || null,
      p_notes: parsed.data.notes || null,
      p_next_action: parsed.data.nextAction || null,
      p_revision_notes: parsed.data.revisionNotes || null,
      p_assigned_to: parsed.data.assignedTo || null,
    })
    : await supabase.rpc("create_content_tracker_item_for_current_user", {
      p_client_id: parsed.data.clientId,
      p_campaign_id: parsed.data.campaignId,
      p_title: parsed.data.title,
      p_platform: parsed.data.platform,
      p_content_type: parsed.data.contentType,
      p_description: parsed.data.description || null,
      p_status: parsed.data.status,
      p_work_date: workDate,
      p_deadline_at: deadlineAt,
      p_publish_at: publishAt,
      p_client_approval_status: parsed.data.clientApprovalStatus || null,
      p_client_issues: parsed.data.clientIssues || null,
      p_notes: parsed.data.notes || null,
      p_next_action: parsed.data.nextAction || null,
      p_assigned_to: parsed.data.assignedTo || null,
    })

  if (result.error?.code === "42501") redirect("/content?notice=forbidden")
  if (result.error?.code === "PGRST202") redirect("/content?notice=content_migration_missing")
  if (result.error) redirect("/content?notice=failed")
  revalidatePath("/content")
  revalidatePath("/calendar")
  redirect(`/content?notice=${parsed.data.id ? "updated" : "created"}`)
}

export async function archiveContentItem(formData: FormData) {
  const id = z.string().uuid().safeParse(field(formData, "id"))
  if (!id.success) redirect("/content?notice=invalid")
  const supabase = await createClient()
  const { error } = await supabase.rpc("archive_content_item_for_current_user", { p_content_id: id.data })
  if (error?.code === "42501") redirect("/content?notice=forbidden")
  if (error) redirect("/content?notice=failed")
  revalidatePath("/content")
  revalidatePath("/calendar")
  redirect("/content?notice=archived")
}

const importRowSchema = z.object({
  client_id: z.string().uuid(),
  campaign_id: z.string().uuid(),
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
  const { data, error } = await supabase.rpc("import_content_items_for_current_user", { p_rows: parsed.data })
  if (error?.code === "42501") redirect("/content?notice=forbidden")
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
