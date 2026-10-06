import { NextRequest, NextResponse } from "next/server"

import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"
import { downloadDriveFile } from "@/lib/storage/google-drive"
import { createServiceClient } from "@/lib/supabase/service"

const inlinePreviewTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime", "application/pdf"])

export async function GET(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const { attachmentId } = await params
  let { data: attachment, error } = await actor.supabase.from("attachments")
    .select("id,file_name,mime_type,provider_file_id").eq("id", attachmentId).is("deleted_at", null).maybeSingle()
  if ((!attachment || error) && await hasStoragePermission(actor, ["storage.manage"])) {
    const service = createServiceClient()
    const result = await service.from("attachments").select("id,file_name,mime_type,provider_file_id")
      .eq("id", attachmentId).eq("organization_id", actor.organizationId).maybeSingle()
    attachment = result.data
    error = result.error
  }
  if (error || !attachment) return NextResponse.json({ error: "File not found." }, { status: 404 })

  try {
    const inline = request.nextUrl.searchParams.get("inline") === "1" && inlinePreviewTypes.has(attachment.mime_type)
    const range = inline && attachment.mime_type.startsWith("video/") ? request.headers.get("range") ?? undefined : undefined
    const response = await downloadDriveFile(actor.organizationId, attachment.provider_file_id, range)
    const safeName = attachment.file_name.replace(/[\u0000-\u001f/\\"<>:|?*]/g, "_").slice(0, 180) || "download"
    const fallbackName = safeName.replace(/[^\x20-\x7e]/g, "_")
    const contentDisposition = inline ? "inline" : "attachment"
    const headers = new Headers({
      "content-type": attachment.mime_type || "application/octet-stream",
      "content-disposition": `${contentDisposition}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(safeName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      "cross-origin-resource-policy": "same-origin",
    })
    for (const name of ["accept-ranges", "content-range", "content-length"]) {
      const value = response.headers.get(name)
      if (value) headers.set(name, value)
    }
    return new NextResponse(response.body, { status: response.status, headers })
  } catch {
    return NextResponse.json({ error: "File download failed. The Google Drive account may need to be reconnected." }, { status: 503 })
  }
}
