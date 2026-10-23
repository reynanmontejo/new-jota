import { NextRequest, NextResponse } from "next/server"

import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"
import { ensureClientFolder, ensureOrganizationFolder, getGoogleDriveStatus, uploadDriveFile } from "@/lib/storage/google-drive"
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_LABEL } from "@/lib/storage/upload-limits"
import { authorizeUpload } from "@/lib/storage/upload-authorization"
import { registerDriveUpload } from "@/lib/storage/register-upload"

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
  const taskId = request.nextUrl.searchParams.get("taskId")
  const contentItemId = request.nextUrl.searchParams.get("contentItemId")
  if (taskId && contentItemId) return NextResponse.json({ error: "Choose a task or a content item, not both." }, { status: 400 })
  let query = actor.supabase.from("attachments").select("id,file_name,mime_type,size_bytes,uploaded_by,created_at,task_id,content_item_id").is("deleted_at", null).order("created_at", { ascending: false })
  if (taskId) {
    const { data: task } = await actor.supabase.from("tasks").select("id,client_id").eq("id", taskId).is("deleted_at", null).maybeSingle()
    if (!task || (clientId && task.client_id !== clientId)) return NextResponse.json({ error: "Task files are unavailable." }, { status: 404 })
    query = query.eq("task_id", taskId)
  }
  else if (contentItemId) {
    if (!clientId) return NextResponse.json({ error: "Client is required for content files." }, { status: 400 })
    const { data: client } = await actor.supabase.from("clients").select("id").eq("id", clientId).is("deleted_at", null).maybeSingle()
    if (!client) return NextResponse.json({ error: "Client files are unavailable." }, { status: 404 })
    let contentItemQuery = actor.supabase.from("content_items").select("id").eq("id", contentItemId).eq("client_id", clientId)
    if (!await hasStoragePermission(actor, ["content.update"])) contentItemQuery = contentItemQuery.is("deleted_at", null)
    const { data: contentItem } = await contentItemQuery.maybeSingle()
    if (!contentItem) return NextResponse.json({ error: "Content files are unavailable." }, { status: 404 })
    query = query.eq("content_item_id", contentItemId).is("task_id", null)
  } else {
    if (!clientId) return NextResponse.json({ error: "Client is required." }, { status: 400 })
    const { data: client } = await actor.supabase.from("clients").select("id").eq("id", clientId).is("deleted_at", null).maybeSingle()
    if (!client) return NextResponse.json({ error: "Client files are unavailable." }, { status: 404 })
    query = query.eq("client_id", clientId).is("task_id", null).is("content_item_id", null)
  }
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
  if ((!clientId && !taskId) || !(file instanceof File)) return NextResponse.json({ error: "Choose a task or client and file." }, { status: 400 })
  const authorized = await authorizeUpload(actor, { clientId, taskId, contentItemId, campaignId, fileName: file.name, mimeType: file.type, size: file.size })
  if (authorized.error) return authorized.error
  const { client } = authorized
  campaignId = authorized.campaignId

  let uploadStage = "preparing the private client folder"
  try {
    const { connection, folderId } = client
      ? await ensureClientFolder(actor.organizationId, client.id, client.name)
      : await ensureOrganizationFolder(actor.organizationId)
    uploadStage = "uploading the file to Google Drive"
    const uploaded = await uploadDriveFile(connection, folderId, file)
    uploadStage = "saving the file record"
    return await registerDriveUpload({ actor, clientId: client?.id ?? null, campaignId, taskId, contentItemId, folderId, uploaded })
  } catch (error) {
    console.error("[Google Drive upload failed]", {
      stage: uploadStage,
      reason: error instanceof Error ? error.message : "Unknown error",
    })
    const reason = error instanceof Error ? error.message : ""
    // These messages are deliberately allow-listed: useful connection guidance
    // without returning arbitrary provider or server details to the browser.
    const message = reason === "Google Drive is not connected"
      ? "Google Drive has not been connected yet. Ask an administrator to connect it under File storage settings."
      : reason.startsWith("Google Drive refresh access was revoked or expired")
        ? "Google Drive authorization expired. Ask an administrator to reconnect the approved account under File storage settings."
        : reason.startsWith("Google rejected the configured OAuth client")
          ? "Google Drive configuration needs attention. Ask an administrator to check the OAuth settings."
          : reason.startsWith("Google Drive authorization could not be refreshed")
            ? "Google Drive could not authorize this upload. Ask an administrator to reconnect the account or check its OAuth settings."
            : "Upload failed. Check the Drive connection and try again."
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
