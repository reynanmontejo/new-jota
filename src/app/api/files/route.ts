import { NextRequest, NextResponse } from "next/server"

import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"
import { deleteDriveFile, ensureClientFolder, getGoogleDriveStatus, uploadDriveFile } from "@/lib/storage/google-drive"
import { createServiceClient } from "@/lib/supabase/service"
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_LABEL } from "@/lib/storage/upload-limits"

const acceptedExtensions = new Map<string, Set<string>>([
  [".jpg", new Set(["image/jpeg"])], [".jpeg", new Set(["image/jpeg"])],
  [".png", new Set(["image/png"])], [".webp", new Set(["image/webp"])], [".gif", new Set(["image/gif"])],
  [".mp4", new Set(["video/mp4"])], [".mov", new Set(["video/quicktime"])],
  [".pdf", new Set(["application/pdf"])], [".txt", new Set(["text/plain"])],
  [".csv", new Set(["text/csv", "application/csv", "application/vnd.ms-excel"])],
  [".docx", new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"])],
  [".xlsx", new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])],
  [".pptx", new Set(["application/vnd.openxmlformats-officedocument.presentationml.presentation"])],
])

async function readBoundedForm(request: NextRequest, byteLimit: number) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error("Missing request body")
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > byteLimit) {
      await reader.cancel()
      throw new Error("Upload request exceeds the size limit")
    }
    chunks.push(value)
  }
  const headers = new Headers(request.headers)
  headers.delete("content-length")
  return new Request(request.url, { method: "POST", headers, body: Buffer.concat(chunks) }).formData()
}

export async function GET(request: NextRequest) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const clientId = request.nextUrl.searchParams.get("clientId")
  if (!clientId) return NextResponse.json({ error: "Client is required." }, { status: 400 })
  const { data: client, error: clientError } = await actor.supabase.from("clients").select("id").eq("id", clientId).is("deleted_at", null).maybeSingle()
  if (clientError || !client) return NextResponse.json({ error: "Client files are unavailable." }, { status: 404 })

  let query = actor.supabase.from("attachments").select("id,file_name,mime_type,size_bytes,uploaded_by,created_at,task_id,content_item_id").eq("client_id", clientId).is("deleted_at", null).order("created_at", { ascending: false })
  const taskId = request.nextUrl.searchParams.get("taskId")
  const contentItemId = request.nextUrl.searchParams.get("contentItemId")
  if (taskId && contentItemId) return NextResponse.json({ error: "Choose a task or a content item, not both." }, { status: 400 })
  if (taskId) query = query.eq("task_id", taskId)
  else if (contentItemId) {
    const { data: contentItem } = await actor.supabase.from("content_items").select("id").eq("id", contentItemId).eq("client_id", clientId).is("deleted_at", null).maybeSingle()
    if (!contentItem) return NextResponse.json({ error: "Content files are unavailable." }, { status: 404 })
    query = query.eq("content_item_id", contentItemId).is("task_id", null)
  } else query = query.is("task_id", null).is("content_item_id", null)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: "Could not load files." }, { status: 503 })
  const driveStatus = await getGoogleDriveStatus(actor.organizationId).catch(() => ({ connected: false as const, email: null }))
  return NextResponse.json({ files: data ?? [], storageConnected: driveStatus.connected }, { headers: { "cache-control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const actor = await getStorageActor()
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > MAX_UPLOAD_SIZE_BYTES + 256_000) return NextResponse.json({ error: `File is larger than the ${MAX_UPLOAD_SIZE_LABEL} limit.` }, { status: 413 })

  const form = await readBoundedForm(request, MAX_UPLOAD_SIZE_BYTES + 256_000).catch(() => null)
  if (!form) return NextResponse.json({ error: "Invalid upload request." }, { status: 400 })
  const clientId = String(form.get("clientId") ?? "")
  const taskId = String(form.get("taskId") ?? "") || null
  const contentItemId = String(form.get("contentItemId") ?? "") || null
  let campaignId = String(form.get("campaignId") ?? "") || null
  const file = form.get("file")
  if (taskId && contentItemId) return NextResponse.json({ error: "Choose a task or a content item, not both." }, { status: 400 })
  if (!clientId || !(file instanceof File)) return NextResponse.json({ error: "Choose a client and file." }, { status: 400 })
  if (file.size < 1 || file.size > MAX_UPLOAD_SIZE_BYTES) return NextResponse.json({ error: `File must be between 1 byte and ${MAX_UPLOAD_SIZE_LABEL}.` }, { status: 413 })
  if (file.name.length > 255 || /[\u0000-\u001f]/.test(file.name)) return NextResponse.json({ error: "File name must be 255 characters or fewer and contain no control characters." }, { status: 400 })
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
  if (!acceptedExtensions.get(extension)?.has(file.type)) return NextResponse.json({ error: "This file type or file extension is not supported." }, { status: 415 })

  const permissionCodes = taskId ? ["tasks.create", "tasks.update"] : ["content.create", "content.update"]
  if (!await hasStoragePermission(actor, permissionCodes)) return NextResponse.json({ error: "You do not have permission to upload files here." }, { status: 403 })
  const { data: client, error: clientError } = await actor.supabase.from("clients").select("id,name,organization_id").eq("id", clientId).is("deleted_at", null).maybeSingle()
  if (clientError || !client || client.organization_id !== actor.organizationId) return NextResponse.json({ error: "Client files are unavailable." }, { status: 404 })
  if (taskId) {
    const { data: task } = await actor.supabase.from("tasks").select("id,client_id").eq("id", taskId).is("deleted_at", null).maybeSingle()
    if (!task || task.client_id !== clientId) return NextResponse.json({ error: "Task files are unavailable." }, { status: 404 })
  }
  if (contentItemId) {
    const { data: contentItem } = await actor.supabase.from("content_items").select("id,client_id,campaign_id").eq("id", contentItemId).eq("client_id", clientId).is("deleted_at", null).maybeSingle()
    if (!contentItem) return NextResponse.json({ error: "Content files are unavailable." }, { status: 404 })
    if (campaignId && campaignId !== contentItem.campaign_id) return NextResponse.json({ error: "The content item does not belong to the selected campaign." }, { status: 400 })
    campaignId = contentItem.campaign_id
  }
  if (campaignId) {
    const { data: campaign } = await actor.supabase.from("campaigns").select("id,client_id").eq("id", campaignId).is("deleted_at", null).maybeSingle()
    if (!campaign || campaign.client_id !== clientId) return NextResponse.json({ error: "Campaign files are unavailable." }, { status: 404 })
  }

  let uploadStage = "preparing the private client folder"
  try {
    const { connection, folderId } = await ensureClientFolder(actor.organizationId, clientId, client.name)
    uploadStage = "uploading the file to Google Drive"
    const uploaded = await uploadDriveFile(connection, folderId, file)
    uploadStage = "saving the file record"
    const service = createServiceClient()
    const { data: attachment, error } = await service.from("attachments").insert({
      organization_id: actor.organizationId,
      client_id: clientId,
      campaign_id: campaignId,
      task_id: taskId,
      content_item_id: contentItemId,
      provider_file_id: uploaded.id,
      provider_folder_id: folderId,
      file_name: uploaded.name,
      mime_type: uploaded.mimeType,
      size_bytes: uploaded.size,
      uploaded_by: actor.userId,
    }).select("id,file_name,mime_type,size_bytes,uploaded_by,created_at,task_id,content_item_id").single()
    if (error || !attachment) {
      try { await deleteDriveFile(connection, uploaded.id) } catch { /* Avoid returning provider details to the browser. */ }
      return NextResponse.json({ error: "The file could not be registered by the app. Contact an administrator." }, { status: 503 })
    }
    uploadStage = "recording the upload activity"
    const { error: activityError } = await service.from("activity_logs").insert({
      organization_id: actor.organizationId,
      actor_id: actor.userId,
      entity_type: taskId ? "task" : contentItemId ? "content_item" : "client",
      entity_id: taskId ?? contentItemId ?? clientId,
      action: "FILE_UPLOADED",
      metadata: { attachment_id: attachment.id, file_name: attachment.file_name, mime_type: attachment.mime_type, size_bytes: attachment.size_bytes },
    })
    if (activityError) {
      await service.from("attachments").delete().eq("id", attachment.id).eq("organization_id", actor.organizationId)
      try { await deleteDriveFile(connection, uploaded.id) } catch { /* Do not expose provider details. */ }
      return NextResponse.json({ error: "The app could not record this upload. Try again or contact an administrator." }, { status: 503 })
    }
    return NextResponse.json({ file: attachment }, { status: 201, headers: { "cache-control": "private, no-store" } })
  } catch (error) {
    console.error("[Google Drive upload failed]", {
      stage: uploadStage,
      reason: error instanceof Error ? error.message : "Unknown error",
    })
    const message = error instanceof Error && error.message.includes("not connected") ? "Google Drive has not been connected yet." : "Upload failed. Check the Drive connection and try again."
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
