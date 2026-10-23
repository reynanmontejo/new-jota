import { beforeEach, describe, expect, it, vi } from "vitest"

const { getWorkspaceRequestContext } = vi.hoisted(() => ({ getWorkspaceRequestContext: vi.fn() }))

vi.mock("@/lib/supabase/request-context", () => ({ getWorkspaceRequestContext }))

import { GET } from "@/app/api/insights-content/route"

const contentRow = {
  id: "content-1",
  client_id: "client-1",
  assigned_to: "user-1",
  created_by: "user-1",
  content_type: "Reel",
  content_category: "video",
  status: "published",
  publish_at: "2026-10-23T00:00:00.000Z",
}

function mockContentQuery(pageForStart: (start: number) => { data: Array<typeof contentRow> | null; error: { message: string } | null }) {
  const filters: Array<[string, ...unknown[]]> = []
  const query = {
    select(columns: string) { filters.push(["select", columns]); return query },
    is(column: string, value: unknown) { filters.push(["is", column, value]); return query },
    or(value: string) { filters.push(["or", value]); return query },
    order(column: string) { filters.push(["order", column]); return query },
    range: vi.fn(async (start: number) => pageForStart(start)),
  }
  const from = vi.fn(() => query)
  return { filters, from, query }
}

describe("content insights route", () => {
  beforeEach(() => getWorkspaceRequestContext.mockReset())

  it("requires an active workspace session", async () => {
    getWorkspaceRequestContext.mockResolvedValue(null)

    const response = await GET()

    expect(response.status).toBe(401)
  })

  it("paginates reports and limits employees to their own content", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({ ...contentRow, id: `content-${index}` }))
    const { filters, from, query } = mockContentQuery((start) => ({
      data: start === 0 ? firstPage : [{ ...contentRow, id: "content-500" }],
      error: null,
    }))
    getWorkspaceRequestContext.mockResolvedValue({
      userId: "user-1",
      roles: [{ code: "account_manager" }],
      supabase: { from },
    })

    const response = await GET()
    const payload = await response.json() as { items: unknown[] }

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(payload.items).toHaveLength(501)
    expect(query.range).toHaveBeenCalledTimes(2)
    expect(filters).toContainEqual(["or", "assigned_to.eq.user-1,and(assigned_to.is.null,created_by.eq.user-1)"])
  })

  it("bounds large reports instead of accumulating rows indefinitely", async () => {
    const page = Array.from({ length: 500 }, (_, index) => ({ ...contentRow, id: `content-${index}` }))
    const { from, query } = mockContentQuery(() => ({ data: page, error: null }))
    getWorkspaceRequestContext.mockResolvedValue({
      userId: "supervisor-1",
      roles: [{ code: "supervisor" }],
      supabase: { from },
    })

    const response = await GET()
    const payload = await response.json() as { error: string }

    expect(response.status).toBe(413)
    expect(payload.error).toContain("10,000")
    expect(query.range).toHaveBeenCalledTimes(21)
  })

  it("returns a stable service error when reporting data cannot be read", async () => {
    const { from } = mockContentQuery(() => ({ data: null, error: { message: "schema unavailable" } }))
    getWorkspaceRequestContext.mockResolvedValue({
      userId: "supervisor-1",
      roles: [{ code: "administrator" }],
      supabase: { from },
    })

    const response = await GET()

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: "Content reporting is unavailable. Check the content reporting migration and try again.",
    })
  })
})
