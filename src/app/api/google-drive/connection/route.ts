import { NextResponse } from "next/server"

import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"
import { getDriveConfig, verifyGoogleDriveConnection } from "@/lib/storage/google-drive"

export async function GET() {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  if (!await hasStoragePermission(actor, ["storage.manage"])) return NextResponse.json({ error: "Administrator permission required." }, { status: 403 })
  if (!getDriveConfig()) return NextResponse.json({ configured: false, connected: false, email: null, health: "configuration_error" }, { headers: { "cache-control": "private, no-store" } })
  try {
    return NextResponse.json({ configured: true, ...await verifyGoogleDriveConnection(actor.organizationId) }, { headers: { "cache-control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Could not load Google Drive status." }, { status: 503 })
  }
}
