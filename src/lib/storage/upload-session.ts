import "server-only"

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// A Google Drive resumable session URL grants upload access to one file. Never
// return it to the browser or persist it in an attachment visible through RLS.
export type UploadSession = {
  organizationId: string
  userId: string
  clientId: string | null
  taskId: string | null
  contentItemId: string | null
  campaignId: string | null
  folderId: string
  fileName: string
  mimeType: string
  size: number
  sessionUrl: string
  expiresAt: number
}

function sessionKey() {
  const encoded = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY
  const key = encoded ? Buffer.from(encoded, "base64") : null
  if (!key || key.length !== 32) throw new Error("Google Drive upload encryption is not configured")
  return key
}

export function sealUploadSession(session: UploadSession) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", sessionKey(), iv)
  cipher.setAAD(Buffer.from("jota-drive-upload-v1"))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")
}

export function openUploadSession(token: string): UploadSession | null {
  if (!token || token.length > 8192) return null
  try {
    const bytes = Buffer.from(token, "base64url")
    if (bytes.length < 29) return null
    const decipher = createDecipheriv("aes-256-gcm", sessionKey(), bytes.subarray(0, 12))
    decipher.setAAD(Buffer.from("jota-drive-upload-v1"))
    decipher.setAuthTag(bytes.subarray(12, 28))
    const session = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")) as UploadSession
    const url = new URL(session.sessionUrl)
    if (url.protocol !== "https:" || url.hostname !== "www.googleapis.com" || url.pathname !== "/upload/drive/v3/files" ||
      !Number.isSafeInteger(session.size) || session.size < 1 || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now() ||
      typeof session.organizationId !== "string" || typeof session.userId !== "string" || typeof session.folderId !== "string") return null
    return session
  } catch { return null }
}
