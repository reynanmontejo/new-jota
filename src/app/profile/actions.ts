"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

const schema = z.object({
  displayName: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().max(120),
})

export async function updateOwnProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect("/login")
  const { data: currentProfile } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle()
  if (!currentProfile) redirect("/profile?error=save")

  const parsed = schema.safeParse({
    displayName: formData.get("displayName"),
    jobTitle: formData.get("jobTitle") ?? "",
  })
  if (!parsed.success) redirect("/profile?error=invalid")

  const { error } = await supabase.rpc("update_own_profile", {
    p_display_name: parsed.data.displayName,
    p_job_title: parsed.data.jobTitle,
    p_avatar_url: currentProfile.avatar_url ?? "",
  })
  if (error) redirect("/profile?error=save")

  revalidatePath("/")
  revalidatePath("/profile")
  redirect("/profile?saved=1")
}

function isSupportedImage(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mimeType === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
  if (mimeType === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  return false
}

function ownAvatarObjectPath(avatarUrl: string | null, userId: string) {
  if (!avatarUrl) return null
  try {
    const pathname = new URL(avatarUrl).pathname
    const marker = "/storage/v1/object/public/profile-avatars/"
    const index = pathname.indexOf(marker)
    if (index < 0) return null
    const objectPath = decodeURIComponent(pathname.slice(index + marker.length))
    return objectPath.startsWith(`${userId}/`) ? objectPath : null
  } catch { return null }
}

export async function uploadProfilePhoto(formData: FormData) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect("/login")
  const { data: profile } = await supabase.from("profiles")
    .select("display_name,job_title,avatar_url,status,deactivated_at").eq("id", user.id).maybeSingle()
  if (!profile || profile.status !== "active" || profile.deactivated_at) redirect("/account-deactivated")

  const file = formData.get("photo")
  if (!(file instanceof File) || file.size < 1 || file.size > 5 * 1024 * 1024) redirect("/profile?photo=invalid")
  if (!(file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp")) redirect("/profile?photo=invalid")
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isSupportedImage(file.type, bytes)) redirect("/profile?photo=invalid")

  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp"
  const objectPath = `${user.id}/${crypto.randomUUID()}.${extension}`
  const storage = supabase.storage.from("profile-avatars")
  const { error: uploadError } = await storage.upload(objectPath, bytes, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  })
  if (uploadError) redirect("/profile?photo=upload-failed")

  const avatarUrl = storage.getPublicUrl(objectPath).data.publicUrl
  const { error: profileError } = await supabase.rpc("update_own_profile", {
    p_display_name: profile.display_name,
    p_job_title: profile.job_title ?? "",
    p_avatar_url: avatarUrl,
  })
  if (profileError) {
    await storage.remove([objectPath])
    redirect("/profile?photo=save-failed")
  }

  const previousPath = ownAvatarObjectPath(profile.avatar_url, user.id)
  if (previousPath && previousPath !== objectPath) {
    const { error } = await storage.remove([previousPath])
    if (error) console.error("[old profile photo cleanup failed]", { userId: user.id, message: error.message })
  }
  revalidatePath("/", "layout")
  revalidatePath("/profile")
  redirect("/profile?photo=saved")
}
