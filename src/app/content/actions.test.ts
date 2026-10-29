import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), revalidate: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`) }) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
import { recordExternalClientDecision, scheduleClientApprovedContent } from "./actions"
const contentId = "50000000-0000-4000-8000-000000000001"
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ error: null }) })

describe("client decision scheduling handoff", () => {
  it("redirects an approved client response to its automatic scheduling panel", async () => {
    const form = new FormData()
    form.set("contentItemId", contentId); form.set("decision", "approved"); form.set("feedback", "")
    await expect(recordExternalClientDecision(form)).rejects.toThrow(`redirect:/content?notice=client_decision_updated&schedule=${contentId}#content-item-${contentId}`)
  })

  it("does not open scheduling when the client requests revisions", async () => {
    const form = new FormData()
    form.set("contentItemId", contentId); form.set("decision", "revision_requested"); form.set("feedback", "Update the title")
    await expect(recordExternalClientDecision(form)).rejects.toThrow(`redirect:/content?notice=client_decision_updated#content-item-${contentId}`)
  })

  it("returns a denied schedule to the panel without revalidating pages", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "22023", message: "Client approval is required for the latest version" } })
    expect(await scheduleClientApprovedContent(contentId, "2099-11-01T09:00:00Z")).toEqual({ ok: false, error: "Client approval is required for the latest version" })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
