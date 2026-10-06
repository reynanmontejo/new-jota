import { NextRequest, NextResponse } from "next/server"

import { finishGoogleAuthorization, getDriveConfig } from "@/lib/storage/google-drive"
import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"

export async function GET(request: NextRequest) {
  const callbackOrigin = new URL(getDriveConfig()?.redirectUri ?? "http://localhost:3000").origin
  const redirectUrl = new URL("/clients", callbackOrigin)
  const fail = (reason: string) => {
    const url = new URL("/settings/storage", redirectUrl)
    url.searchParams.set("drive", reason)
    return NextResponse.redirect(url)
  }
  const returnedState = request.nextUrl.searchParams.get("state")
  const expectedState = request.cookies.get("northstar-drive-oauth-state")?.value
  const code = request.nextUrl.searchParams.get("code")
  if (!returnedState || !expectedState || returnedState !== expectedState || !code) return fail("oauth-failed")
  const actor = await getStorageActor()
  if (!actor) return NextResponse.redirect(new URL("/login", request.nextUrl.origin))
  if (!await hasStoragePermission(actor, ["storage.manage"])) return fail("access-denied")
  if (!getDriveConfig()) return fail("not-configured")

  try {
    await finishGoogleAuthorization(code, actor.organizationId, actor.userId)
    const response = NextResponse.redirect(new URL("/settings/storage?drive=connected", redirectUrl))
    response.cookies.set("northstar-drive-oauth-state", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/google-drive/callback", maxAge: 0 })
    return response
  } catch {
    return fail("connect-failed")
  }
}
