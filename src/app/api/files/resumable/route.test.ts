import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({
  getStorageActor: vi.fn(), hasStoragePermission: vi.fn(), authorizeUpload: vi.fn(),
  ensureClientFolder: vi.fn(), ensureOrganizationFolder: vi.fn(), startDriveUpload: vi.fn(),
  deleteDriveFile: vi.fn(), registerDriveUpload: vi.fn(),
  openUploadSession: vi.fn(), sealUploadSession: vi.fn(),
}))
vi.mock("@/lib/storage/authorization", () => ({ getStorageActor: mocks.getStorageActor, hasStoragePermission: mocks.hasStoragePermission }))
vi.mock("@/lib/storage/upload-authorization", () => ({ authorizeUpload: mocks.authorizeUpload }))
vi.mock("@/lib/storage/google-drive", () => ({
  ensureClientFolder: mocks.ensureClientFolder, ensureOrganizationFolder: mocks.ensureOrganizationFolder,
  startDriveUpload: mocks.startDriveUpload, deleteDriveFile: mocks.deleteDriveFile,
}))
vi.mock("@/lib/storage/register-upload", () => ({ registerDriveUpload: mocks.registerDriveUpload }))
vi.mock("@/lib/storage/upload-session", () => ({ openUploadSession: mocks.openUploadSession, sealUploadSession: mocks.sealUploadSession }))

import { GET, POST, PUT, UPLOAD_CHUNK_BYTES } from "@/app/api/files/resumable/route"

const actor = { userId: "user-1", organizationId: "org-1", supabase: {} }
const session = {
  organizationId: "org-1", userId: "user-1", clientId: "client-1", taskId: null,
  contentItemId: null, campaignId: null, folderId: "folder-1", fileName: "clip.mp4",
  mimeType: "video/mp4", size: 10 * 1024 * 1024,
  sessionUrl: "https://www.googleapis.com/upload/drive/v3/files?upload_id=opaque",
  expiresAt: Date.now() + 60_000,
}

function chunkRequest(offset: number, length: number) {
  return new NextRequest("https://jota.example/api/files/resumable", {
    method: "PUT", headers: { "x-upload-session": "encrypted", "x-upload-offset": String(offset), "content-length": String(length) },
    body: new Uint8Array(length),
  })
}

describe("resumable Drive upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getStorageActor.mockResolvedValue(actor)
    mocks.hasStoragePermission.mockResolvedValue(true)
    mocks.authorizeUpload.mockResolvedValue({ client: { id: "client-1", name: "Client", organization_id: "org-1" }, campaignId: null, error: null })
    mocks.ensureClientFolder.mockResolvedValue({ connection: {}, folderId: "folder-1" })
    mocks.ensureOrganizationFolder.mockResolvedValue({ connection: {}, folderId: "root-1" })
    mocks.startDriveUpload.mockResolvedValue(session.sessionUrl)
    mocks.openUploadSession.mockReturnValue(session)
    mocks.sealUploadSession.mockReturnValue("encrypted")
    mocks.registerDriveUpload.mockResolvedValue(NextResponse.json({ file: { id: "attachment-1" } }, { status: 201 }))
  })

  it("starts an authorized upload without returning the Drive session URL", async () => {
    const request = new NextRequest("https://jota.example/api/files/resumable", {
      method: "POST", body: JSON.stringify({ clientId: "client-1", fileName: "clip.mp4", mimeType: "video/mp4", size: session.size }),
    })
    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ session: "encrypted", chunkBytes: UPLOAD_CHUNK_BYTES })
    expect(mocks.startDriveUpload).toHaveBeenCalledOnce()
  })

  it("rejects chunks larger than the Vercel-safe limit before reading them", async () => {
    const request = new NextRequest("https://jota.example/api/files/resumable", {
      method: "PUT", headers: { "x-upload-session": "encrypted", "x-upload-offset": "0", "content-length": String(UPLOAD_CHUNK_BYTES + 1) },
      body: new Uint8Array(1),
    })
    const response = await PUT(request)
    expect(response.status).toBe(400)
  })

  it("rejects a session belonging to another user", async () => {
    mocks.openUploadSession.mockReturnValueOnce({ ...session, userId: "someone-else" })
    const response = await PUT(chunkRequest(0, 256 * 1024))
    expect(response.status).toBe(401)
  })

  it("rejects invalid JSON instead of throwing a server error", async () => {
    const response = await POST(new NextRequest("https://jota.example/api/files/resumable", { method: "POST", body: "null" }))
    expect(response.status).toBe(400)
  })

  it("forwards a Drive-compatible chunk and follows its acknowledged range", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 308, headers: { range: `bytes=0-${UPLOAD_CHUNK_BYTES - 1}` } }))
    try {
      const response = await PUT(chunkRequest(0, UPLOAD_CHUNK_BYTES))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ nextOffset: UPLOAD_CHUNK_BYTES })
      expect(fetchMock).toHaveBeenCalledWith(session.sessionUrl, expect.objectContaining({
        method: "PUT", redirect: "manual", headers: expect.objectContaining({ "content-range": `bytes 0-${UPLOAD_CHUNK_BYTES - 1}/${session.size}` }),
      }))
    } finally { fetchMock.mockRestore() }
  })

  it("can recover position after an interrupted request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 308, headers: { range: "bytes=0-262143" } }))
    try {
      const response = await GET(new NextRequest("https://jota.example/api/files/resumable", { headers: { "x-upload-session": "encrypted" } }))
      expect(await response.json()).toEqual({ nextOffset: 262144 })
      expect(fetchMock).toHaveBeenCalledWith(session.sessionUrl, expect.objectContaining({ headers: { "content-length": "0", "content-range": `bytes */${session.size}` } }))
    } finally { fetchMock.mockRestore() }
  })

  it("registers a completed file only after Drive confirms it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ id: "drive-1", name: "clip.mp4", mimeType: "video/mp4", size: String(session.size) }))
    try {
      const response = await PUT(chunkRequest(UPLOAD_CHUNK_BYTES * 2, session.size - UPLOAD_CHUNK_BYTES * 2))
      expect(response.status).toBe(201)
      expect(mocks.registerDriveUpload).toHaveBeenCalledWith(expect.objectContaining({ clientId: "client-1", uploaded: { id: "drive-1", name: "clip.mp4", mimeType: "video/mp4", size: session.size } }))
    } finally { fetchMock.mockRestore() }
  })
})
