"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const schema = z.object({
  displayName: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().max(120),
  avatarUrl: z.union([z.literal(""), z.url().max(2048).refine((url) => url.startsWith("https://"))]),
})

export async function updateOwnProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect("/login")

  const parsed = schema.safeParse({
    displayName: formData.get("displayName"),
    jobTitle: formData.get("jobTitle") ?? "",
    avatarUrl: formData.get("avatarUrl") ?? "",
  })
  if (!parsed.success) redirect("/profile?error=invalid")

  const { error } = await supabase.rpc("update_own_profile", {
    p_display_name: parsed.data.displayName,
    p_job_title: parsed.data.jobTitle,
    p_avatar_url: parsed.data.avatarUrl,
  })
  if (error) redirect("/profile?error=save")

  revalidatePath("/")
  revalidatePath("/profile")
  redirect("/profile?saved=1")
}
