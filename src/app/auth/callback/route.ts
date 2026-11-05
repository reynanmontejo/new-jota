import { NextResponse, type NextRequest } from "next/server"

import { isSupabaseConfigured } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const isProfileEmail = request.nextUrl.searchParams.get("next") === "/profile"
  const failurePath = isProfileEmail ? "/profile?email=confirmation-failed" : "/login?error=callback"
  // Secure Email Change returns a message, without a session code, after the
  // first inbox is confirmed. Do not turn that intermediate step into an error
  // or claim that both addresses are verified.
  if (isProfileEmail && !code && !request.nextUrl.searchParams.has("error")
    && request.nextUrl.searchParams.get("message")?.startsWith("Confirmation link accepted.")
    && isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/profile?email=pending", request.url))
  }
  if (!code || !isSupabaseConfigured()) {
    return NextResponse.redirect(new URL(failurePath, request.url))
  }

  const supabase = await createClient()
  const flowId = request.nextUrl.searchParams.get("sb_flow_id")
  const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
  if (error) return NextResponse.redirect(new URL(failurePath, request.url))

  return NextResponse.redirect(new URL(isProfileEmail ? "/profile?email=checked" : "/", request.url))
}
