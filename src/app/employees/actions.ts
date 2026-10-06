"use server"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { getEmployeeManagementContext } from "@/lib/supabase/employee-admin"
import { getServerSupabaseEnv } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

const employeeSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase(),
  jobTitle: z.string().trim().max(120),
  roleCode: z.enum(["account_manager", "supervisor"]),
  password: z.string().min(8).max(72),
})
const updateSchema = z.object({
  employeeId: z.uuid(),
  displayName: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().max(120),
  roleCode: z.enum(["account_manager", "supervisor"]),
  status: z.enum(["active", "inactive"]),
})
function field(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === "string" ? value : ""
}
function serviceClient() {
  const { url, serviceRoleKey } = getServerSupabaseEnv()
  return createSupabaseClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function createEmployee(formData: FormData) {
  const authorized = await getEmployeeManagementContext("employees.create")
  if (!authorized) redirect("/access-denied")
  const parsed = employeeSchema.safeParse({
    displayName: field(formData, "displayName"), email: field(formData, "email"),
    jobTitle: field(formData, "jobTitle"), roleCode: field(formData, "roleCode"),
    password: field(formData, "password"),
  })
  if (!parsed.success) redirect("/employees?notice=invalid")

  let admin
  try { admin = serviceClient() } catch { redirect("/employees?notice=setup") }
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { display_name: parsed.data.displayName },
  })
  if (createError || !created.user) redirect("/employees?notice=create_failed")
  const { error: profileError } = await admin.rpc("admin_provision_employee", {
    p_user_id: created.user.id, p_actor_id: authorized.actorId, p_email: parsed.data.email,
    p_display_name: parsed.data.displayName, p_job_title: parsed.data.jobTitle, p_role_code: parsed.data.roleCode,
  })
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    redirect("/employees?notice=create_failed")
  }
  revalidatePath("/employees")
  redirect("/employees?notice=created")
}

export async function updateEmployee(formData: FormData) {
  const authorized = await getEmployeeManagementContext("employees.update")
  if (!authorized) redirect("/access-denied")
  const parsed = updateSchema.safeParse({
    employeeId: field(formData, "employeeId"), displayName: field(formData, "displayName"),
    jobTitle: field(formData, "jobTitle"), roleCode: field(formData, "roleCode"),
    status: field(formData, "status"),
  })
  if (!parsed.success) redirect("/employees?notice=invalid")
  let admin
  try { admin = serviceClient() } catch { redirect("/employees?notice=setup") }
  const { error } = await admin.rpc("admin_update_employee", {
    p_actor_id: authorized.actorId, p_employee_id: parsed.data.employeeId,
    p_display_name: parsed.data.displayName, p_job_title: parsed.data.jobTitle,
    p_role_code: parsed.data.roleCode, p_status: parsed.data.status,
  })
  if (error) redirect("/employees?notice=update_failed")
  revalidatePath("/employees")
  redirect("/employees?notice=updated")
}

export async function setEmployeeActiveState(formData: FormData) {
  const employeeId = z.uuid().safeParse(field(formData, "employeeId"))
  const status = z.enum(["active", "inactive"]).safeParse(field(formData, "status"))
  if (!employeeId.success || !status.success) redirect("/employees?notice=invalid")
  const authorized = await getEmployeeManagementContext("employees.deactivate")
  if (!authorized) redirect("/access-denied")

  const supabase = await createClient()
  const { data: profile, error: loadError } = await supabase.from("profiles")
    .select("display_name, job_title")
    .eq("organization_id", authorized.organizationId).eq("id", employeeId.data).maybeSingle()
  if (loadError || !profile) redirect("/employees?notice=update_failed")
  const { data: memberships, error: membershipsError } = await supabase.from("user_roles")
    .select("role_id").eq("organization_id", authorized.organizationId).eq("user_id", employeeId.data)
  if (membershipsError || !memberships?.length) redirect("/employees?notice=update_failed")
  const { data: roles, error: rolesError } = await supabase.from("roles")
    .select("code").eq("organization_id", authorized.organizationId)
    .in("id", memberships.map(({ role_id }) => role_id))
  if (rolesError) redirect("/employees?notice=update_failed")
  const role = roles?.[0]
  if (!role || !["account_manager", "supervisor"].includes(role.code)) redirect("/employees?notice=protected")
  let admin
  try { admin = serviceClient() } catch { redirect("/employees?notice=setup") }
  const { error } = await admin.rpc("admin_update_employee", {
    p_actor_id: authorized.actorId, p_employee_id: employeeId.data,
    p_display_name: profile.display_name, p_job_title: profile.job_title ?? "",
    p_role_code: role.code, p_status: status.data,
  })
  if (error) redirect("/employees?notice=update_failed")
  revalidatePath("/employees")
  redirect("/employees?notice=" + (status.data === "inactive" ? "deactivated" : "reactivated"))
}

export async function moveEmployeeToTrash(formData: FormData) {
  const employeeId = z.uuid().safeParse(field(formData, "employeeId"))
  const confirmationEmail = z.email().trim().toLowerCase().safeParse(field(formData, "confirmationEmail"))
  if (!employeeId.success || !confirmationEmail.success) redirect("/employees?notice=invalid")
  const authorized = await getEmployeeManagementContext("employees.delete")
  if (!authorized || employeeId.data === authorized.actorId) redirect("/employees?notice=protected")
  let admin
  try { admin = serviceClient() } catch { redirect("/employees?notice=setup") }
  const { error } = await admin.rpc("admin_move_employee_to_trash", {
    p_actor_id: authorized.actorId,
    p_employee_id: employeeId.data,
    p_confirmation_email: confirmationEmail.data,
  })
  if (error) {
    redirect(`/employees?view=trash&notice=${error.code === "42501" ? "protected" : error.code === "22023" ? "confirmation" : "delete_failed"}`)
  }
  revalidatePath("/employees")
  redirect("/employees?view=trash&notice=trashed")
}

export async function restoreEmployeeFromTrash(formData: FormData) {
  const employeeId = z.uuid().safeParse(field(formData, "employeeId"))
  if (!employeeId.success) redirect("/employees?view=trash&notice=invalid")
  const authorized = await getEmployeeManagementContext("employees.delete")
  if (!authorized) redirect("/employees?view=trash&notice=protected")
  let admin
  try { admin = serviceClient() } catch { redirect("/employees?view=trash&notice=setup") }
  const { error } = await admin.rpc("admin_restore_employee_from_trash", {
    p_actor_id: authorized.actorId,
    p_employee_id: employeeId.data,
  })
  if (error) redirect(`/employees?view=trash&notice=${error.code === "42501" ? "protected" : "restore_failed"}`)
  revalidatePath("/employees")
  redirect("/employees?view=trash&notice=restored")
}
