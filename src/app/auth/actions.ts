"use server"

import { redirect } from "next/navigation"

import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

function safeDestination(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/"
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const destination = safeDestination(formData.get("next"))

  if (!isSupabaseConfigured()) redirect("/login?error=setup")
  if (!email || !password) redirect("/login?error=invalid")

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect("/login?error=invalid")

  redirect(destination)
}
