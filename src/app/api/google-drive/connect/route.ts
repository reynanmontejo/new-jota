import { randomBytes } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

import { createGoogleAuthorizationUrl, getDriveConfig } from "@/lib/storage/google-drive"
import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"

export async function GET(request: NextRequest) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.redirect(new URL("/login", request.nextUrl.origin))
  if (!await hasStoragePermission(actor, ["storage.manage"])) return NextResponse.json({ error: "Administrator permission required." }, { status: 403 })
  if (!getDriveConfig()) return NextResponse.json({ error: "Google Drive is not configured yet. Follow docs/google-drive-setup.md." }, { status: 503 })

  const state = randomBytes(32).toString("base64url")
  const response = NextResponse.redirect(createGoogleAuthorizationUrl(state))
  response.cookies.set("northstar-drive-oauth-state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/google-drive/callback", maxAge: 600 })
  return response
}
