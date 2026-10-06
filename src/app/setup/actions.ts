"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const schema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  displayName: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().max(120),
  timezone: z.string().trim().min(1).max(80),
})

export async function bootstrapAdministrator(formData: FormData) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect("/login")

  const parsed = schema.safeParse({
    organizationName: formData.get("organizationName"),
    displayName: formData.get("displayName"),
    jobTitle: formData.get("jobTitle") ?? "",
    timezone: formData.get("timezone"),
  })
  if (!parsed.success) redirect("/setup?error=invalid")

  try {
    Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone })
  } catch {
    redirect("/setup?error=invalid")
  }

  const slug = parsed.data.organizationName.toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-+$/g, "")
  const { error } = await supabase.rpc("bootstrap_initial_administrator", {
    p_organization_name: parsed.data.organizationName,
    p_organization_slug: slug,
    p_timezone: parsed.data.timezone,
    p_display_name: parsed.data.displayName,
    p_job_title: parsed.data.jobTitle,
  })
  if (error) redirect("/setup?error=" + (error.message.includes("already complete") ? "complete" : "save"))

  revalidatePath("/")
  revalidatePath("/profile")
  redirect("/profile?saved=setup")
}
