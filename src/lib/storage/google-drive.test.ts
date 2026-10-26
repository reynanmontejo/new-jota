import { createCipheriv, randomBytes } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }))

import { downloadDriveFile, finishGoogleAuthorization, verifyGoogleDriveConnection } from "@/lib/storage/google-drive"

const key = Buffer.alloc(32, 7)

function savedConnection(organizationId: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update("private-refresh-token", "utf8"), cipher.final()])
  return {
    organization_id: organizationId,
    google_email: "owner@example.com",
    refresh_token_ciphertext: ciphertext.toString("base64"),
    refresh_token_iv: iv.toString("base64"),
    refresh_token_tag: cipher.getAuthTag().toString("base64"),
    root_folder_id: "existing-folder",
  }
}

function mockConnection(data: ReturnType<typeof savedConnection> | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
  mocks.createServiceClient.mockReturnValue({
    from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }),
  })
}

describe("Google Drive connection verification", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "client-id")
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "client-secret")
    vi.stubEnv("GOOGLE_DRIVE_REDIRECT_URI", "https://jota.example/api/google-drive/callback")
    vi.stubEnv("GOOGLE_DRIVE_OWNER_EMAIL", "owner@example.com")
    vi.stubEnv("GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY", key.toString("base64"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it("does not call Google when no connection is saved", async () => {
    mockConnection(null)
    const fetchMock = vi.spyOn(globalThis, "fetch")
    expect(await verifyGoogleDriveConnection("drive-health-disconnected")).toEqual({ connected: false, email: null, health: "disconnected" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("forces a token refresh to verify a saved grant", async () => {
    mockConnection(savedConnection("drive-health-ready"))
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ access_token: "new-access-token", expires_in: 3600 }))
    expect(await verifyGoogleDriveConnection("drive-health-ready")).toEqual({ connected: true, email: "owner@example.com", health: "ready" })
    expect(fetchMock).toHaveBeenCalledWith("https://oauth2.googleapis.com/token", expect.objectContaining({ method: "POST", cache: "no-store" }))
    const request = fetchMock.mock.calls[0][1]
    expect(String(request?.body)).toContain("grant_type=refresh_token")
    expect(String(request?.body)).not.toContain("new-access-token")
  })

  it("identifies an expired refresh grant without exposing its value", async () => {
    mockConnection(savedConnection("drive-health-expired"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "invalid_grant" }, { status: 400 }))
    expect(await verifyGoogleDriveConnection("drive-health-expired")).toEqual({ connected: true, email: "owner@example.com", health: "reauthorization_required" })
  })

  it("distinguishes OAuth configuration failure from a revoked grant", async () => {
    mockConnection(savedConnection("drive-health-config"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "invalid_client" }, { status: 401 }))
    expect(await verifyGoogleDriveConnection("drive-health-config")).toEqual({ connected: true, email: "owner@example.com", health: "configuration_error" })
  })

  it("uses the new grant immediately after reconnecting and preserves the Drive folder", async () => {
    const organizationId = "drive-reconnect-cache"
    let connection = savedConnection(organizationId)
    const maybeSingle = vi.fn().mockImplementation(async () => ({ data: connection, error: null }))
    const upsert = vi.fn().mockImplementation(async (value: typeof connection) => {
      connection = value
      return { error: null }
    })
    mocks.createServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
        upsert,
      }),
    })
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith("/token")) {
        const body = String(init?.body)
        if (body.includes("grant_type=authorization_code")) return Response.json({ access_token: "authorization-access", refresh_token: "replacement-refresh" })
        return Response.json({ access_token: body.includes("replacement-refresh") ? "new-access" : "old-access", expires_in: 3600 })
      }
      if (url.endsWith("/userinfo")) return Response.json({ email: "owner@example.com", email_verified: true })
      if (url.includes("/drive/v3/files/")) return new Response("file bytes")
      throw new Error(`Unexpected URL: ${url}`)
    })

    expect((await verifyGoogleDriveConnection(organizationId)).health).toBe("ready")
    await finishGoogleAuthorization("new-code", organizationId, "administrator-id")
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ root_folder_id: "existing-folder" }))

    await downloadDriveFile(organizationId, "drive-file-id")
    const driveCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/drive/v3/files/"))
    expect(new Headers(driveCall?.[1]?.headers).get("authorization")).toBe("Bearer new-access")
  })
})
