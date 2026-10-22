import { afterEach, describe, expect, it, vi } from "vitest"
import { isSupabaseConfigured } from "./env"

afterEach(() => vi.unstubAllEnvs())

function setSupabaseEnv(url: string, nodeEnv = "development") {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url)
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "local-test-key")
  vi.stubEnv("NODE_ENV", nodeEnv)
}

describe("isSupabaseConfigured", () => {
  it("accepts HTTPS project URLs", () => {
    setSupabaseEnv("https://project.supabase.co")
    expect(isSupabaseConfigured()).toBe(true)
  })

  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "accepts local HTTP for loopback host %s outside production",
    (host) => {
      setSupabaseEnv(`http://${host}:55421`)
      expect(isSupabaseConfigured()).toBe(true)
    },
  )

  it("rejects local HTTP in production", () => {
    setSupabaseEnv("http://127.0.0.1:55421", "production")
    expect(isSupabaseConfigured()).toBe(false)
  })

  it("rejects non-loopback HTTP URLs", () => {
    setSupabaseEnv("http://example.com")
    expect(isSupabaseConfigured()).toBe(false)
  })

  it("continues rejecting the example project placeholder", () => {
    setSupabaseEnv("https://your-project.supabase.co")
    expect(isSupabaseConfigured()).toBe(false)
  })
})
