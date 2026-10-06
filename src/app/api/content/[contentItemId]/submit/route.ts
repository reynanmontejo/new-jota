import { NextRequest, NextResponse } from "next/server"

import { getStorageActor } from "@/lib/storage/authorization"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest, { params }: { params: Promise<{ contentItemId: string }> }) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in with an active workspace account." }, { status: 401 })
  const { contentItemId } = await params
  if (!uuidPattern.test(contentItemId)) return NextResponse.json({ error: "Content item not found." }, { status: 404 })

  let payload: { attachmentIds?: unknown; notes?: unknown }
  try { payload = await request.json() as typeof payload } catch { return NextResponse.json({ error: "Invalid submission request." }, { status: 400 }) }
  const attachmentIds = payload.attachmentIds
  const notes = payload.notes
  if (!Array.isArray(attachmentIds) || attachmentIds.length < 1 || attachmentIds.length > 30
    || !attachmentIds.every((id) => typeof id === "string" && uuidPattern.test(id))
    || (notes !== undefined && (typeof notes !== "string" || notes.length > 5000))) {
    return NextResponse.json({ error: "Select 1 to 30 uploaded files and keep notes under 5,000 characters." }, { status: 400 })
  }

  const { data, error } = await actor.supabase.rpc("submit_content_for_review", {
    p_content_item_id: contentItemId,
    p_attachment_ids: attachmentIds,
    p_notes: typeof notes === "string" ? notes.trim() || null : null,
  })
  if (error?.code === "42501") return NextResponse.json({ error: "You do not have permission to submit this item, or the item is not in your client scope." }, { status: 403 })
  if (error?.code === "P0002") return NextResponse.json({ error: "Content item not found." }, { status: 404 })
  if (error?.code === "PGRST202") return NextResponse.json({ error: "Apply the content review migration, then refresh." }, { status: 503 })
  if (error) return NextResponse.json({ error: error.code === "22023" ? error.message : "The item could not be submitted. Refresh and try again." }, { status: error.code === "22023" ? 400 : 503 })
  return NextResponse.json({ versionId: data }, { status: 201, headers: { "cache-control": "private, no-store" } })
}
