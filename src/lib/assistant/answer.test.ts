import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { answerAssistant } from "./answer"
import type { WorkspaceRequestContext } from "@/lib/supabase/request-context"

const rpc = vi.fn()
const actor = { userId: "private-user-id", organizationId: "private-org-id", roles: [{ code: "account_manager", name: "Employee" }], supabase: { rpc } } as unknown as WorkspaceRequestContext
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("OPENAI_ASSISTANT_MODEL", ""); vi.stubGlobal("fetch", vi.fn()); rpc.mockResolvedValue({ data: true, error: null }) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe("optional conversational AI", () => {
  it("provides honest Help Center guidance without credentials or paid calls", async () => {
    const result = await answerAssistant(actor, "How do I import CSV content?", [])
    expect(result.mode).toBe("guides")
    expect(result.notice).toContain("not connected")
    expect(fetch).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
  it("bounds history/output, keeps the key server-only and requests no stored provider response", async () => {
    vi.stubEnv("OPENAI_API_KEY", "server-test-key"); vi.stubEnv("OPENAI_ASSISTANT_MODEL", "test-model")
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Open Content and choose Import from CSV." }] }] }), { status: 200 }))
    const result = await answerAssistant(actor, "Import CSV?", Array.from({ length: 12 }, () => ({ role: "user" as const, content: "Explain content." })))
    expect(result.mode).toBe("ai")
    const [url, options] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("https://api.openai.com/v1/responses")
    const payload = JSON.parse(String(options?.body))
    expect(payload.store).toBe(false)
    expect(payload.input).toHaveLength(9)
    expect(payload.max_output_tokens).toBe(1200)
    expect(String(options?.body)).not.toContain("private-user-id")
    expect(String(options?.body)).not.toContain("private-org-id")
    expect(JSON.stringify(result)).not.toContain("server-test-key")
    expect(rpc).toHaveBeenCalledWith("claim_assistant_request")
  })
  it("does not call the provider when a distributed allowance is denied or unavailable", async () => {
    vi.stubEnv("OPENAI_API_KEY", "server-test-key"); vi.stubEnv("OPENAI_ASSISTANT_MODEL", "test-model")
    rpc.mockResolvedValue({ data: false, error: null })
    expect((await answerAssistant(actor, "Content help", [])).mode).toBe("guides")
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } })
    expect((await answerAssistant(actor, "Content help", [])).mode).toBe("guides")
    expect(fetch).not.toHaveBeenCalled()
  })
  it("falls back without exposing provider errors, secrets or incomplete answers", async () => {
    vi.stubEnv("OPENAI_API_KEY", "server-test-key"); vi.stubEnv("OPENAI_ASSISTANT_MODEL", "test-model")
    vi.mocked(fetch).mockResolvedValue(new Response("Provider diagnostic details", { status: 429 }))
    expect((await answerAssistant(actor, "Content help", [])).mode).toBe("guides")
    vi.mocked(fetch).mockRejectedValue(new Error("secret diagnostic"))
    expect(JSON.stringify(await answerAssistant(actor, "Content help", []))).not.toContain("secret diagnostic")
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ status: "incomplete", output: [] })))
    expect((await answerAssistant(actor, "Content help", [])).mode).toBe("guides")
  })
})
