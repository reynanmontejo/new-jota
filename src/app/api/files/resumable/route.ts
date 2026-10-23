import { NextRequest, NextResponse } from "next/server"

import { getStorageActor, hasStoragePermission, type StorageActor } from "@/lib/storage/authorization"
import { authorizeUpload, type UploadDetails } from "@/lib/storage/upload-authorization"
import { deleteDriveFile, ensureClientFolder, ensureOrganizationFolder, startDriveUpload } from "@/lib/storage/google-drive"
import { registerDriveUpload } from "@/lib/storage/register-upload"
import { openUploadSession, sealUploadSession, type UploadSession } from "@/lib/storage/upload-session"

// 4 MiB is a Drive-compatible 256 KiB multiple and stays below Vercel's
// 4.5 MB per-request limit, including request headers.
export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024
const JSON_LIMIT_BYTES = 16 * 1024

function privateJson(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "private, no-store" } })
}

async function readBoundedBytes(request: NextRequest, limit: number) {
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > limit) { await reader.cancel(); return null }
    chunks.push(value)
  }
  return Buffer.concat(chunks, length)
}

function uploadDetails(session: UploadSession): UploadDetails {
  return {
    clientId: session.clientId ?? "", taskId: session.taskId,
    contentItemId: session.contentItemId, campaignId: session.campaignId,
    fileName: session.fileName, mimeType: session.mimeType, size: session.size,
  }
}

async function authorizedSession(request: NextRequest) {
  const actor = await getStorageActor()
  if (!actor) return { error: privateJson({ error: "Sign in required." }, 401) }
  const session = openUploadSession(request.headers.get("x-upload-session") ?? "")
  if (!session || session.organizationId !== actor.organizationId || session.userId !== actor.userId) {
    return { error: privateJson({ error: "The upload session expired. Start the upload again." }, 401) }
  }
  const codes = session.taskId ? ["tasks.create", "tasks.update"] : ["content.create", "content.update"]
  if (!await hasStoragePermission(actor, codes)) return { error: privateJson({ error: "You no longer have permission to upload this file." }, 403) }
  return { actor, session, error: null }
}

async function finalize(actor: StorageActor, session: UploadSession, response: Response) {
  const metadata = await response.json().catch(() => null) as { id?: string; name?: string; mimeType?: string; size?: string } | null
  if (!metadata?.id) return privateJson({ error: "Google Drive did not confirm the uploaded file." }, 503)
  const { connection } = await ensureOrganizationFolder(actor.organizationId)
  if (metadata.name !== session.fileName || metadata.mimeType !== session.mimeType || Number(metadata.size) !== session.size) {
    try { await deleteDriveFile(connection, metadata.id) } catch { /* Do not expose provider details. */ }
    return privateJson({ error: "Google Drive returned unexpected file details. Upload again." }, 503)
  }
  const authorization = await authorizeUpload(actor, uploadDetails(session))
  if (authorization.error) {
    try { await deleteDriveFile(connection, metadata.id) } catch { /* Do not expose provider details. */ }
    return authorization.error
  }
  return registerDriveUpload({
    actor, clientId: authorization.client?.id ?? null, campaignId: authorization.campaignId,
    taskId: session.taskId, contentItemId: session.contentItemId, folderId: session.folderId,
    uploaded: { id: metadata.id, name: metadata.name, mimeType: metadata.mimeType, size: session.size },
  })
}

async function driveResult(actor: StorageActor, session: UploadSession, response: Response) {
  if (response.status === 308) {
    const range = response.headers.get("range")
    const match = range?.match(/^bytes=0-(\d+)$/)
    const nextOffset = match ? Number(match[1]) + 1 : 0
    if (!Number.isSafeInteger(nextOffset) || nextOffset >= session.size) return privateJson({ error: "Google Drive returned an invalid upload position." }, 503)
    return privateJson({ nextOffset })
  }
  if (response.status === 200 || response.status === 201) return finalize(actor, session, response)
  if (response.status === 404 || response.status === 410) return privateJson({ error: "The Google Drive upload session expired. Start again." }, 410)
  console.error("[Google Drive resumable upload failed]", { status: response.status })
  return privateJson({ error: "Google Drive could not continue the upload. Try again." }, 503)
}

export async function POST(request: NextRequest) {
  const actor = await getStorageActor()
  if (!actor) return privateJson({ error: "Sign in required." }, 401)
  if (Number(request.headers.get("content-length") ?? 0) > JSON_LIMIT_BYTES) return privateJson({ error: "Upload details are too large." }, 413)
  const bytes = await readBoundedBytes(request, JSON_LIMIT_BYTES)
  if (!bytes) return privateJson({ error: "Upload details are too large." }, 413)
  let input: Record<string, unknown>
  try { input = JSON.parse(bytes.toString("utf8")) as Record<string, unknown> } catch { return privateJson({ error: "Invalid upload details." }, 400) }
  if (!input || typeof input !== "object" || Array.isArray(input)) return privateJson({ error: "Invalid upload details." }, 400)
  const details: UploadDetails = {
    clientId: typeof input.clientId === "string" ? input.clientId : "",
    taskId: typeof input.taskId === "string" && input.taskId ? input.taskId : null,
    contentItemId: typeof input.contentItemId === "string" && input.contentItemId ? input.contentItemId : null,
    campaignId: typeof input.campaignId === "string" && input.campaignId ? input.campaignId : null,
    fileName: typeof input.fileName === "string" ? input.fileName : "",
    mimeType: typeof input.mimeType === "string" ? input.mimeType : "",
    size: Number(input.size),
  }
  const authorization = await authorizeUpload(actor, details)
  if (authorization.error) return authorization.error
  try {
    const { connection, folderId } = authorization.client
      ? await ensureClientFolder(actor.organizationId, authorization.client.id, authorization.client.name)
      : await ensureOrganizationFolder(actor.organizationId)
    const sessionUrl = await startDriveUpload(connection, folderId, details.fileName, details.mimeType, details.size)
    const session: UploadSession = {
      organizationId: actor.organizationId, userId: actor.userId,
      clientId: authorization.client?.id ?? null, taskId: details.taskId,
      contentItemId: details.contentItemId, campaignId: authorization.campaignId,
      folderId, fileName: details.fileName, mimeType: details.mimeType,
      size: details.size, sessionUrl, expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    }
    return privateJson({ session: sealUploadSession(session), chunkBytes: UPLOAD_CHUNK_BYTES })
  } catch (error) {
    console.error("[Google Drive upload initiation failed]", { reason: error instanceof Error ? error.message : "Unknown error" })
    return privateJson({ error: "Google Drive could not start the upload. Check the connection and try again." }, 503)
  }
}

export async function PUT(request: NextRequest) {
  const authorized = await authorizedSession(request)
  if (authorized.error) return authorized.error
  const { actor, session } = authorized
  const offsetHeader = request.headers.get("x-upload-offset")
  const offset = offsetHeader === null ? NaN : Number(offsetHeader)
  const contentLength = request.headers.get("content-length")
  const declaredLength = contentLength === null ? null : Number(contentLength)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= session.size ||
    (declaredLength !== null && (!Number.isSafeInteger(declaredLength) || declaredLength < 1 || declaredLength > UPLOAD_CHUNK_BYTES))) {
    return privateJson({ error: "Invalid upload chunk." }, 400)
  }
  const bytes = await readBoundedBytes(request, UPLOAD_CHUNK_BYTES)
  if (!bytes || bytes.length < 1 || (declaredLength !== null && bytes.length !== declaredLength) || offset + bytes.length > session.size ||
    (offset + bytes.length < session.size && bytes.length % (256 * 1024) !== 0)) return privateJson({ error: "Invalid upload chunk size." }, 400)
  try {
    const response = await fetch(session.sessionUrl, {
      method: "PUT", redirect: "manual", cache: "no-store",
      headers: { "content-type": session.mimeType, "content-range": `bytes ${offset}-${offset + bytes.length - 1}/${session.size}` },
      body: bytes,
    })
    return driveResult(actor, session, response)
  } catch {
    return privateJson({ error: "The upload was interrupted. Check its progress and retry." }, 503)
  }
}

export async function GET(request: NextRequest) {
  const authorized = await authorizedSession(request)
  if (authorized.error) return authorized.error
  const { actor, session } = authorized
  try {
    const response = await fetch(session.sessionUrl, {
      method: "PUT", redirect: "manual", cache: "no-store",
      headers: { "content-length": "0", "content-range": `bytes */${session.size}` },
    })
    return driveResult(actor, session, response)
  } catch { return privateJson({ error: "Could not check upload progress. Retry shortly." }, 503) }
}
