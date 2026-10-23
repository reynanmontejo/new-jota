import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { openUploadSession, sealUploadSession, type UploadSession } from "@/lib/storage/upload-session"

const key = Buffer.alloc(32, 7).toString("base64")
let originalKey: string | undefined

function session(overrides: Partial<UploadSession> = {}): UploadSession {
  return {
    organizationId: "org-1", userId: "user-1", clientId: "client-1", taskId: null,
    contentItemId: null, campaignId: null, folderId: "folder-1",
    fileName: "example.mp4", mimeType: "video/mp4", size: 100 * 1024 * 1024,
    sessionUrl: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=opaque",
    expiresAt: Date.now() + 60_000, ...overrides,
  }
}

describe("encrypted Drive upload sessions", () => {
  beforeEach(() => {
    originalKey = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY
    process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY = key
  })
  afterEach(() => {
    if (originalKey === undefined) delete process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY
    else process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY = originalKey
  })

  it("round trips without exposing the Drive capability URL", () => {
    const input = session()
    const token = sealUploadSession(input)
    expect(token).not.toContain("googleapis")
    expect(openUploadSession(token)).toEqual(input)
  })

  it("rejects tampered and expired sessions", () => {
    const token = sealUploadSession(session())
    expect(openUploadSession(`${token.slice(0, -2)}xx`)).toBeNull()
    expect(openUploadSession(sealUploadSession(session({ expiresAt: Date.now() - 1 })))).toBeNull()
  })

  it("rejects an unsafe provider URL even inside an authentic token", () => {
    expect(openUploadSession(sealUploadSession(session({ sessionUrl: "https://example.com/upload/drive/v3/files" })))).toBeNull()
  })
})
