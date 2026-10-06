"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const campaignStatuses = ["draft", "active", "paused", "completed", "cancelled"] as const
const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  description: z.string().max(5000),
  status: z.enum(campaignStatuses),
  startDate: z.union([z.literal(""), z.iso.date()]),
  endDate: z.union([z.literal(""), z.iso.date()]),
})

function field(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === "string" ? value : ""
}

function campaignUrl(clientId: string, notice: string) {
  return z.string().uuid().safeParse(clientId).success
    ? `/clients/${encodeURIComponent(clientId)}?tab=campaigns&notice=${notice}`
    : `/clients?tab=campaigns&notice=${notice}`
}

function mutationNotice(code: string | undefined) {
  if (code === "42501") return "forbidden"
  if (code === "23505") return "duplicate"
  if (code === "P0002") return "not_found"
  if (code === "22023") return "invalid"
  if (code === "PGRST202") return "migration_missing"
  return "failed"
}

export async function saveCampaign(formData: FormData) {
  const parsed = campaignSchema.safeParse({
    id: field(formData, "id") || undefined,
    clientId: field(formData, "clientId"),
    name: field(formData, "name"),
    description: field(formData, "description"),
    status: field(formData, "status"),
    startDate: field(formData, "startDate"),
    endDate: field(formData, "endDate"),
  })
  const fallbackClientId = z.string().uuid().safeParse(field(formData, "clientId"))
  if (!parsed.success) redirect(campaignUrl(fallbackClientId.success ? fallbackClientId.data : "", "invalid"))
  if (parsed.data.startDate && parsed.data.endDate && parsed.data.endDate < parsed.data.startDate) {
    redirect(campaignUrl(parsed.data.clientId, "invalid"))
  }

  const supabase = await createClient()
  const args = {
    p_name: parsed.data.name,
    p_description: parsed.data.description || null,
    p_status: parsed.data.status,
    p_start_date: parsed.data.startDate || null,
    p_end_date: parsed.data.endDate || null,
  }
  const result = parsed.data.id
    ? await supabase.rpc("update_campaign_for_current_user", { p_campaign_id: parsed.data.id, ...args })
    : await supabase.rpc("create_campaign_for_current_user", { p_client_id: parsed.data.clientId, ...args })

  if (result.error) redirect(campaignUrl(parsed.data.clientId, mutationNotice(result.error.code)))
  revalidatePath("/clients")
  revalidatePath(`/clients/${parsed.data.clientId}`)
  revalidatePath("/content")
  revalidatePath("/calendar")
  redirect(campaignUrl(parsed.data.clientId, parsed.data.id ? "updated" : "created"))
}

export async function archiveCampaign(formData: FormData) {
  const clientId = z.string().uuid().safeParse(field(formData, "clientId"))
  const campaignId = z.string().uuid().safeParse(field(formData, "id"))
  if (!clientId.success || !campaignId.success || field(formData, "confirmArchive") !== "yes") {
    redirect(campaignUrl(clientId.success ? clientId.data : "", "invalid"))
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("archive_campaign_for_current_user", { p_campaign_id: campaignId.data })
  if (error) redirect(campaignUrl(clientId.data, mutationNotice(error.code)))
  revalidatePath("/clients")
  revalidatePath(`/clients/${clientId.data}`)
  revalidatePath("/content")
  revalidatePath("/calendar")
  redirect(campaignUrl(clientId.data, "archived"))
}
