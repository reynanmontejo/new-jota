"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { getAdministratorContext } from "@/lib/supabase/employee-admin"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

function field(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === "string" ? value : ""
}

async function notifyAdministrators(organizationId: string, requestId: string, requesterName: string) {
  const service = createServiceClient()
  const { data: memberships, error: membershipError } = await service.from("user_roles")
    .select("user_id,role_id").eq("organization_id", organizationId)
  if (membershipError || !memberships?.length) return
  const roleIds = [...new Set(memberships.map(({ role_id }) => role_id))]
  const { data: adminRoles, error: rolesError } = await service.from("roles")
    .select("id").eq("organization_id", organizationId).eq("code", "administrator").in("id", roleIds)
  if (rolesError || !adminRoles?.length) return
  const adminRoleIds = new Set(adminRoles.map(({ id }) => id))
  const adminIds = [...new Set(memberships.filter(({ role_id }) => adminRoleIds.has(role_id)).map(({ user_id }) => user_id))]
  if (!adminIds.length) return
  const { data: activeAdmins, error: profileError } = await service.from("profiles")
    .select("id").eq("organization_id", organizationId).eq("status", "active").is("deactivated_at", null).in("id", adminIds)
  if (profileError || !activeAdmins?.length) return
  const { error } = await service.from("notifications").insert(activeAdmins.map(({ id }) => ({
    organization_id: organizationId,
    recipient_id: id,
    type: "password_change_requested",
    title: "Password change request",
    body: `${requesterName} requested approval to change their password.`,
    entity_type: "password_change_request",
    entity_id: requestId,
    href: "/employees?view=password-requests",
    dedupe_key: `password-change-request:${requestId}:${id}`,
  })))
  if (error) console.error("[password request notification failed]", { requestId, message: error.message })
}

async function notifyRequester(organizationId: string, requestId: string, userId: string, status: "approved" | "rejected") {
  const service = createServiceClient()
  const approved = status === "approved"
  const { error } = await service.from("notifications").insert({
    organization_id: organizationId,
    recipient_id: userId,
    type: "password_change_request_decided",
    title: approved ? "Password change approved" : "Password change request declined",
    body: approved ? "You can now change your password from your Profile page." : "Your password change request was declined. Contact an administrator if you need help.",
    entity_type: "password_change_request",
    entity_id: requestId,
    href: "/profile#password-security",
    dedupe_key: `password-change-decision:${requestId}:${status}`,
  })
  if (error) console.error("[password request decision notification failed]", { requestId, message: error.message })
}

export async function requestPasswordChange(formData: FormData) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect("/login")
  const { data: profile } = await supabase.from("profiles").select("organization_id,display_name,status,deactivated_at")
    .eq("id", user.id).maybeSingle()
  if (!profile || profile.status !== "active" || profile.deactivated_at) redirect("/account-deactivated")
  const { data: memberships, error: membershipError } = await supabase.from("user_roles").select("role_id")
    .eq("organization_id", profile.organization_id).eq("user_id", user.id)
  if (membershipError || !memberships?.length) redirect("/profile?password=unavailable")
  const { data: adminRole } = await supabase.from("roles").select("id").eq("organization_id", profile.organization_id)
    .eq("code", "administrator").in("id", memberships.map(({ role_id }) => role_id)).maybeSingle()
  if (adminRole) redirect("/profile?password=admin-self-service")
  const note = z.string().trim().max(500).safeParse(field(formData, "requestNote"))
  if (!note.success) redirect("/profile?password=invalid")

  const service = createServiceClient()
  const { data: request, error } = await service.from("password_change_requests").insert({
    organization_id: profile.organization_id,
    user_id: user.id,
    request_note: note.data || null,
  }).select("id").single()
  if (error || !request) redirect(`/profile?password=${error?.code === "23505" ? "already-requested" : "unavailable"}`)
  await notifyAdministrators(profile.organization_id, request.id, profile.display_name)
  revalidatePath("/employees")
  redirect("/profile?password=requested")
}

export async function decidePasswordChangeRequest(formData: FormData) {
  const admin = await getAdministratorContext()
  if (!admin) redirect("/access-denied")
  const requestId = z.uuid().safeParse(field(formData, "requestId"))
  const decision = z.enum(["approved", "rejected"]).safeParse(field(formData, "decision"))
  const note = z.string().trim().max(500).safeParse(field(formData, "decisionNote"))
  if (!requestId.success || !decision.success || !note.success) redirect("/employees?view=password-requests&notice=invalid")

  const service = createServiceClient()
  const { data: request, error: readError } = await service.from("password_change_requests")
    .select("id,user_id").eq("id", requestId.data).eq("organization_id", admin.organizationId).eq("status", "pending").maybeSingle()
  if (readError || !request) redirect("/employees?view=password-requests&notice=stale")
  const { data: updated, error } = await service.from("password_change_requests").update({
    status: decision.data,
    decided_by: admin.actorId,
    decided_at: new Date().toISOString(),
    decision_note: note.data || null,
  }).eq("id", request.id).eq("organization_id", admin.organizationId).eq("status", "pending").select("id").maybeSingle()
  if (error || !updated) redirect("/employees?view=password-requests&notice=stale")
  await notifyRequester(admin.organizationId, request.id, request.user_id, decision.data)
  revalidatePath("/employees")
  revalidatePath("/profile")
  redirect(`/employees?view=password-requests&notice=${decision.data}`)
}

export async function completePasswordChange(requestId: string): Promise<{ ok: boolean }> {
  const id = z.uuid().safeParse(requestId)
  if (!id.success) return { ok: false }
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false }
  const { data: profile } = await supabase.from("profiles").select("organization_id,status,deactivated_at")
    .eq("id", user.id).maybeSingle()
  if (!profile || profile.status !== "active" || profile.deactivated_at) return { ok: false }
  const service = createServiceClient()
  const { data, error } = await service.from("password_change_requests").update({
    status: "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", id.data).eq("organization_id", profile.organization_id).eq("user_id", user.id).eq("status", "approved")
    .select("id").maybeSingle()
  revalidatePath("/profile")
  return { ok: !error && Boolean(data) }
}
