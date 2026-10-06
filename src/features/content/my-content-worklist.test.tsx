import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/app/content/actions", () => ({ archiveContentItem: vi.fn(), saveContentItem: vi.fn() }))
vi.mock("@/features/clients/client-files", () => ({ ClientFiles: () => null }))
vi.mock("@/features/content/content-import", () => ({ ContentImport: () => null }))

import { ContentTracker, type TrackerItem } from "@/features/content/content-tracker"

afterEach(cleanup)

const items: TrackerItem[] = [
  {
    id: "item-1", client_id: "client-1", campaign_id: "campaign-1", title: "October product reel", platform: "Instagram / Facebook", content_type: "Reel", description: null,
    status: "in_production", work_date: "2026-10-06", deadline_at: "2026-10-08", publish_at: "2026-10-10T09:00:00Z", client_approval_status: null, client_issues: null,
    notes: null, revision_count: 0, revision_notes: null, next_action: "Finish first cut", assigned_to: "editor-1", client_name: "Northwind", campaign_name: "October", assignee_name: "Editor",
  },
  {
    id: "item-2", client_id: "client-2", campaign_id: "campaign-2", title: "November announcement", platform: "LinkedIn", content_type: "Graphic", description: null,
    status: "planned", work_date: null, deadline_at: null, publish_at: null, client_approval_status: null, client_issues: null,
    notes: null, revision_count: 0, revision_notes: null, next_action: null, assigned_to: null, client_name: "Contoso", campaign_name: "November", assignee_name: null,
  },
]

describe("My Content worklist", () => {
  it("shows accessible content, useful workflow details, and can search it", () => {
    render(<ContentTracker clients={[{ id: "client-1", name: "Northwind" }, { id: "client-2", name: "Contoso" }]} campaigns={[]} assignees={{}} items={items} canCreate={false} canEdit={false} workView />)

    expect(screen.getByRole("heading", { name: "My Content" })).toBeInTheDocument()
    expect(screen.getByText("Finish first cut")).toBeInTheDocument()
    expect(screen.getByText("Creator/editor: Editor")).toBeInTheDocument()
    expect(screen.getByText(/creator assignment is shown separately/i)).toBeInTheDocument()

    fireEvent.change(screen.getByRole("textbox", { name: "Search my content" }), { target: { value: "contoso" } })
    expect(screen.getByText("November announcement")).toBeInTheDocument()
    expect(screen.queryByText("October product reel")).not.toBeInTheDocument()
  })
})
