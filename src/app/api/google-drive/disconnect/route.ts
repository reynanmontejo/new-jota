import { NextResponse } from "next/server"

import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"
import { disconnectGoogleDrive } from "@/lib/storage/google-drive"

export async function POST() {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  if (!await hasStoragePermission(actor, ["storage.manage"])) return NextResponse.json({ error: "Administrator permission required." }, { status: 403 })
  try {
    await disconnectGoogleDrive(actor.organizationId)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Could not disconnect Google Drive." }, { status: 503 })
  }
}
