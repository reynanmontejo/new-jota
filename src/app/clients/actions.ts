"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { getClientAssignmentContext, getClientLifecyclePermissions, getClientManagementContext } from "@/lib/supabase/client-admin"
import { createClient } from "@/lib/supabase/server"

const clientSchema = z.object({
  name: z.string().trim().min(2).max(140),
  description: z.string().trim().max(2000),
  websiteUrl: z.union([z.literal(""), z.url().startsWith("https://")]),
  platforms: z.array(z.string().trim().min(2).max(60)).max(20),
  customPlatforms: z.string().trim().max(600),
})

function field(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === "string" ? value : ""
}

function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 140).replace(/-+$/g, "")
}

export async function createClientRecord(formData: FormData) {
  const authorized = await getClientManagementContext()
  if (!authorized) redirect("/clients?notice=forbidden")

  const parsed = clientSchema.safeParse({
    name: field(formData, "name"),
    description: field(formData, "description"),
    websiteUrl: field(formData, "websiteUrl"),
    platforms: formData.getAll("platforms").filter((value): value is string => typeof value === "string"),
    customPlatforms: field(formData, "customPlatforms"),
  })
  if (!parsed.success) redirect("/clients?notice=invalid")

  const platformsByKey = new Map<string, string>()
  for (const platform of [...parsed.data.platforms, ...parsed.data.customPlatforms.split(",").map((value) => value.trim()).filter(Boolean)]) {
    if (platform.length < 2 || platform.length > 60) redirect("/clients?notice=invalid")
    platformsByKey.set(platform.toLocaleLowerCase(), platform)
  }
  if (platformsByKey.size > 20) redirect("/clients?notice=invalid")

  const slug = slugify(parsed.data.name)
  if (!slug) redirect("/clients?notice=invalid")

  const supabase = await createClient()
  const { data: clientId, error } = await supabase.rpc("create_client_for_current_user", {
    p_name: parsed.data.name,
    p_slug: slug,
    p_description: parsed.data.description || null,
    p_website_url: parsed.data.websiteUrl || null,
    p_social_platforms: [...platformsByKey.values()],
  })

  if (error?.code === "23505") redirect("/clients?notice=duplicate")
  if (error) redirect("/clients?notice=failed")

  revalidatePath("/clients")
  if (typeof clientId !== "string") redirect("/clients?notice=failed")
  redirect(`/clients/${encodeURIComponent(clientId)}?notice=created`)
}

export async function updateClientAccountManagers(formData: FormData) {
  const authorized = await getClientAssignmentContext()
  const clientId = field(formData, "clientId")
  if (!authorized) redirect(`/clients/${encodeURIComponent(clientId)}?tab=team&notice=assignment-forbidden`)

  const accountManagerIds = formData.getAll("accountManagerIds")
    .filter((value): value is string => typeof value === "string")
  const primaryAccountManagerId = field(formData, "primaryAccountManagerId")
  const parsed = z.object({
    clientId: z.uuid(),
    accountManagerIds: z.array(z.uuid()).min(1).max(20),
    primaryAccountManagerId: z.uuid(),
  }).safeParse({ clientId, accountManagerIds, primaryAccountManagerId })
  if (!parsed.success || !parsed.data.accountManagerIds.includes(parsed.data.primaryAccountManagerId)) {
    redirect(`/clients/${encodeURIComponent(clientId)}?tab=team&notice=assignment-invalid`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("set_client_account_managers", {
    p_client_id: parsed.data.clientId,
    p_account_manager_ids: [...new Set(parsed.data.accountManagerIds)],
    p_primary_account_manager_id: parsed.data.primaryAccountManagerId,
  })
  if (error) redirect(`/clients/${encodeURIComponent(clientId)}?tab=team&notice=assignment-failed`)

  revalidatePath("/clients")
  revalidatePath(`/clients/${encodeURIComponent(clientId)}`)
  redirect(`/clients/${encodeURIComponent(clientId)}?tab=team&notice=assignments-updated`)
}

export async function updateClientStatus(formData: FormData) {
  const permissions = await getClientLifecyclePermissions()
  const clientId = field(formData, "clientId")
  if (!permissions?.canManageStatus) redirect(`/clients/${encodeURIComponent(clientId)}?notice=status-forbidden`)
  const parsed = z.object({ clientId: z.uuid(), status: z.enum(["active", "paused", "archived"]) })
    .safeParse({ clientId, status: field(formData, "status") })
  if (!parsed.success) redirect(`/clients/${encodeURIComponent(clientId)}?notice=status-invalid`)

  const supabase = await createClient()
  const { error } = await supabase.rpc("update_client_status_for_current_user", {
    p_client_id: parsed.data.clientId,
    p_status: parsed.data.status,
  })
  if (error) redirect(`/clients/${encodeURIComponent(clientId)}?notice=status-failed`)

  revalidatePath("/clients")
  revalidatePath(`/clients/${encodeURIComponent(clientId)}`)
  revalidatePath("/calendar")
  revalidatePath("/content")
  revalidatePath("/tasks")
  redirect(`/clients/${encodeURIComponent(clientId)}?notice=status-updated`)
}

export async function moveClientToTrash(formData: FormData) {
  const permissions = await getClientLifecyclePermissions()
  const clientId = field(formData, "clientId")
  if (!permissions?.canManageTrash) redirect(`/clients/${encodeURIComponent(clientId)}?notice=trash-forbidden`)
  const parsedClientId = z.uuid().safeParse(clientId)
  if (!parsedClientId.success) redirect("/clients?notice=trash-invalid")

  const supabase = await createClient()
  const { error } = await supabase.rpc("move_client_to_trash", { p_client_id: parsedClientId.data })
  if (error) redirect(`/clients/${encodeURIComponent(clientId)}?notice=trash-failed`)

  revalidatePath("/", "layout")
  redirect("/clients?view=trash&notice=client-trashed")
}

export async function restoreClientFromTrash(formData: FormData) {
  const permissions = await getClientLifecyclePermissions()
  const clientId = field(formData, "clientId")
  if (!permissions?.canManageTrash) redirect("/clients?view=trash&notice=trash-forbidden")
  const parsedClientId = z.uuid().safeParse(clientId)
  if (!parsedClientId.success) redirect("/clients?view=trash&notice=trash-invalid")

  const supabase = await createClient()
  const { error } = await supabase.rpc("restore_client_from_trash", { p_client_id: parsedClientId.data })
  if (error) redirect("/clients?view=trash&notice=restore-failed")

  revalidatePath("/", "layout")
  redirect("/clients?notice=client-restored")
}
