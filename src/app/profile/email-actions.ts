"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

type EmailChangeState = { ok: boolean; message: string }
const emailSchema = z.string().trim().email().max(254)

export async function requestOwnEmailChange(_previous: EmailChangeState, formData: FormData): Promise<EmailChangeState> {
  const parsed = emailSchema.safeParse(formData.get("email"))
  const confirmation = emailSchema.safeParse(formData.get("confirmEmail"))
  if (!parsed.success || !confirmation.success || parsed.data !== confirmation.data) {
    return { ok: false, message: "Enter a valid new email address and matching confirmation." }
  }
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { ok: false, message: "Sign in again before changing your email." }
    const { data: profile, error: profileError } = await supabase.from("profiles")
      .select("status,deactivated_at,timezone").eq("id", user.id).maybeSingle()
    if (profileError) return { ok: false, message: "Email changes are unavailable until the profile preferences migration is applied." }
    if (!profile || profile.status !== "active" || profile.deactivated_at) return { ok: false, message: "An active profile is required." }
    if (parsed.data.toLowerCase() === user.email?.toLowerCase()) return { ok: false, message: "Enter an email address different from your current address." }

    // Next validates the Server Action's Origin against its host. Do not take a
    // return URL from submitted fields or permit an arbitrary callback target.
    const origin = (await headers()).get("origin")
    if (!origin) return { ok: false, message: "Could not determine this site's address. Reload and try again." }
    const url = new URL(origin)
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
      return { ok: false, message: "Use the secure Jota site to change your email." }
    }
    const callback = new URL("/auth/callback", url.origin)
    callback.searchParams.set("next", "/profile")
    const resending = Boolean(user.email && user.new_email?.toLowerCase() === parsed.data.toLowerCase())
    const { data, error } = resending
      ? await supabase.auth.resend({ type: "email_change", email: user.email!, options: { emailRedirectTo: callback.toString() } })
      : await supabase.auth.updateUser({ email: parsed.data }, { emailRedirectTo: callback.toString() })
    if (error) return { ok: false, message: error.status === 429 || error.code === "over_email_send_rate_limit" ? "Too many verification requests. Wait a few minutes before trying again." : "Could not request the email change. Check the address and try again later." }
    revalidatePath("/profile")
    if (data.user?.email?.toLowerCase() === parsed.data.toLowerCase() && !data.user.new_email) {
      return { ok: true, message: "Your account email has been updated." }
    }
    return { ok: true, message: "Verification requested. Check your new and current inboxes and follow all confirmation links. Your current address remains active until confirmed." }
  } catch {
    return { ok: false, message: "Email verification is temporarily unavailable. Try again later." }
  }
}
