import "server-only"

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

import { createServiceClient } from "@/lib/supabase/service"

const DRIVE_API = "https://www.googleapis.com/drive/v3"
const TOKEN_API = "https://oauth2.googleapis.com/token"

type EncryptedToken = { ciphertext: string; iv: string; tag: string }
type Connection = {
  organization_id: string
  google_email: string
  refresh_token_ciphertext: string
  refresh_token_iv: string
  refresh_token_tag: string
  root_folder_id: string | null
}
const accessTokenCache = new Map<string, { token: string; expiresAt: number }>()

export function getDriveConfig() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI
  const ownerEmail = process.env.GOOGLE_DRIVE_OWNER_EMAIL?.trim().toLowerCase()
  const encryptionKey = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY
  if (!clientId || !clientSecret || !redirectUri || !ownerEmail || !encryptionKey || Buffer.from(encryptionKey, "base64").length !== 32) return null
  return { clientId, clientSecret, redirectUri, ownerEmail }
}

function encryptionKey() {
  const value = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY
  if (!value) throw new Error("Google Drive token encryption is not configured")
  const key = Buffer.from(value, "base64")
  if (key.length !== 32) throw new Error("Google Drive token encryption key must be base64 for 32 random bytes")
  return key
}

function encryptToken(token: string): EncryptedToken {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") }
}

function decryptToken(connection: Connection) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(connection.refresh_token_iv, "base64"))
  decipher.setAuthTag(Buffer.from(connection.refresh_token_tag, "base64"))
  return Buffer.concat([
    decipher.update(Buffer.from(connection.refresh_token_ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8")
}

export function createGoogleAuthorizationUrl(state: string) {
  const config = getDriveConfig()
  if (!config) throw new Error("Google Drive OAuth environment is not configured")
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString()
  return url.toString()
}

export async function finishGoogleAuthorization(code: string, organizationId: string, userId: string) {
  const config = getDriveConfig()
  if (!config) throw new Error("Google Drive OAuth environment is not configured")
  const tokenResponse = await fetch(TOKEN_API, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" }),
    cache: "no-store",
  })
  const token = await tokenResponse.json() as { access_token?: string; refresh_token?: string; error?: string }
  if (!tokenResponse.ok || !token.access_token || !token.refresh_token) throw new Error("Google did not return the required offline access token. Revoke the app in Google Account permissions and connect again.")

  const accountResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token.access_token}` }, cache: "no-store" })
  const account = await accountResponse.json() as { email?: string; email_verified?: boolean }
  if (!accountResponse.ok || !account.email_verified || account.email?.toLowerCase() !== config.ownerEmail) {
    throw new Error(`Connect the approved Google Drive account (${config.ownerEmail}).`)
  }

  const encrypted = encryptToken(token.refresh_token)
  const service = createServiceClient()
  const { data: current, error: lookupError } = await service.from("google_drive_connections").select("root_folder_id").eq("organization_id", organizationId).maybeSingle()
  if (lookupError) throw new Error("Could not load the current Google Drive connection")
  const { error } = await service.from("google_drive_connections").upsert({
    organization_id: organizationId,
    google_email: account.email,
    refresh_token_ciphertext: encrypted.ciphertext,
    refresh_token_iv: encrypted.iv,
    refresh_token_tag: encrypted.tag,
    root_folder_id: current?.root_folder_id ?? null,
    connected_by: userId,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error("Could not securely save the Google Drive connection")
}

async function getConnection(organizationId: string) {
  const service = createServiceClient()
  const { data, error } = await service.from("google_drive_connections").select("*").eq("organization_id", organizationId).maybeSingle()
  if (error) throw new Error("Could not load Google Drive connection")
  return data as Connection | null
}

export async function getGoogleDriveStatus(organizationId: string) {
  const connection = await getConnection(organizationId)
  return connection ? { connected: true as const, email: connection.google_email } : { connected: false as const, email: null }
}

async function getAccessToken(connection: Connection) {
  const cached = accessTokenCache.get(connection.organization_id)
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token
  const config = getDriveConfig()
  if (!config) throw new Error("Google Drive OAuth environment is not configured")
  const response = await fetch(TOKEN_API, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: decryptToken(connection), grant_type: "refresh_token" }),
    cache: "no-store",
  })
  const payload = await response.json() as { access_token?: string; expires_in?: number }
  if (!response.ok || !payload.access_token) throw new Error("Google Drive authorization expired or was revoked. Reconnect the account.")
  accessTokenCache.set(connection.organization_id, { token: payload.access_token, expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000 })
  return payload.access_token
}

async function driveRequest(connection: Connection, url: string, init: RequestInit = {}) {
  const accessToken = await getAccessToken(connection)
  const headers = new Headers(init.headers)
  headers.set("authorization", `Bearer ${accessToken}`)
  return fetch(url, { ...init, headers, cache: "no-store" })
}

async function ensureRootFolder(connection: Connection) {
  if (connection.root_folder_id) return connection.root_folder_id
  const response = await driveRequest(connection, `${DRIVE_API}/files?fields=id`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Jota Client Files", mimeType: "application/vnd.google-apps.folder" }),
  })
  const payload = await response.json() as { id?: string }
  if (!response.ok || !payload.id) throw new Error("Could not create the private Jota Drive folder")
  const service = createServiceClient()
  await service.from("google_drive_connections").update({ root_folder_id: payload.id, updated_at: new Date().toISOString() }).eq("organization_id", connection.organization_id)
  connection.root_folder_id = payload.id
  return payload.id
}

export async function ensureClientFolder(organizationId: string, clientId: string, clientName: string) {
  const connection = await getConnection(organizationId)
  if (!connection) throw new Error("Google Drive is not connected")
  const service = createServiceClient()
  const { data: saved } = await service.from("client_drive_folders").select("provider_folder_id").eq("organization_id", organizationId).eq("client_id", clientId).maybeSingle()
  if (saved?.provider_folder_id) return { connection, folderId: saved.provider_folder_id }

  const rootId = await ensureRootFolder(connection)
  const create = await driveRequest(connection, `${DRIVE_API}/files?fields=id`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `${clientName} (${clientId.slice(0, 8)})`, mimeType: "application/vnd.google-apps.folder", parents: [rootId] }),
  })
  const folder = await create.json() as { id?: string }
  if (!create.ok || !folder.id) throw new Error("Could not create the client Drive folder")
  const { error } = await service.from("client_drive_folders").insert({ organization_id: organizationId, client_id: clientId, provider_folder_id: folder.id })
  if (error) {
    // A concurrent first upload may have created the canonical mapping.
    const { data: canonical } = await service.from("client_drive_folders").select("provider_folder_id").eq("organization_id", organizationId).eq("client_id", clientId).maybeSingle()
    if (canonical?.provider_folder_id) return { connection, folderId: canonical.provider_folder_id }
    throw new Error("Could not save the client Drive folder mapping")
  }
  return { connection, folderId: folder.id }
}

export async function uploadDriveFile(connection: Connection, folderId: string, file: File) {
  const accessToken = await getAccessToken(connection)
  const start = await fetch(`${DRIVE_API.replace("/drive/v3", "/upload/drive/v3")}/files?uploadType=resumable&fields=id,name,mimeType,size`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", "x-upload-content-type": file.type || "application/octet-stream", "x-upload-content-length": String(file.size) },
    body: JSON.stringify({ name: file.name, mimeType: file.type || "application/octet-stream", parents: [folderId] }),
    cache: "no-store",
  })
  const sessionUrl = start.headers.get("location")
  if (!start.ok || !sessionUrl) throw new Error("Google Drive could not start the upload")
  const result = await fetch(sessionUrl, { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: await file.arrayBuffer(), cache: "no-store" })
  const metadata = await result.json() as { id?: string; name?: string; mimeType?: string; size?: string }
  if (!result.ok || !metadata.id) throw new Error("Google Drive upload failed")
  return { id: metadata.id, name: metadata.name ?? file.name, mimeType: metadata.mimeType ?? file.type ?? "application/octet-stream", size: Number(metadata.size ?? file.size) }
}

export async function downloadDriveFile(organizationId: string, fileId: string, range?: string) {
  const connection = await getConnection(organizationId)
  if (!connection) throw new Error("Google Drive is not connected")
  const headers = range ? { range } : undefined
  const response = await driveRequest(connection, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers })
  if (!response.ok || !response.body) throw new Error("Could not download this file from Google Drive")
  return response
}

export async function deleteDriveFile(connection: Connection, fileId: string) {
  const response = await driveRequest(connection, `${DRIVE_API}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" })
  if (!response.ok && response.status !== 404) throw new Error("Could not clean up the unlinked Drive upload")
}

export async function disconnectGoogleDrive(organizationId: string) {
  const service = createServiceClient()
  const connection = await getConnection(organizationId)
  if (connection) {
    accessTokenCache.delete(organizationId)
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: decryptToken(connection) }),
        cache: "no-store",
      })
    } catch { /* Removing the server-side token still prevents app access. */ }
  }
  const { error } = await service.from("google_drive_connections").delete().eq("organization_id", organizationId)
  if (error) throw new Error("Could not disconnect Google Drive")
  // The Drive files remain private in Drive; deleting this link never deletes user files.
}

export const googleDriveOwnerEmail = process.env.GOOGLE_DRIVE_OWNER_EMAIL?.trim().toLowerCase() ?? "joynojohn@gmail.com"
