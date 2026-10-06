import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/app/clients/campaign-actions", () => ({ archiveCampaign: vi.fn(), saveCampaign: vi.fn() }))

import { CampaignManager, type CampaignRecord } from "@/features/clients/campaign-manager"

afterEach(cleanup)

const campaigns: CampaignRecord[] = [
  { id: "campaign-1", client_id: "client-1", name: "Autumn launch", description: "Seasonal", status: "active", start_date: "2026-10-01", end_date: "2026-11-01" },
  { id: "campaign-2", client_id: "client-1", name: "Holiday plan", description: null, status: "draft", start_date: null, end_date: null },
]

describe("campaign manager", () => {
  it("shows client campaigns and filters by name", () => {
    render(<CampaignManager clientId="client-1" campaigns={campaigns} permissions={{ canCreate: false, canUpdate: false, canArchive: false }} />)

    expect(screen.getByText("Autumn launch")).toBeInTheDocument()
    expect(screen.getByText("Holiday plan")).toBeInTheDocument()
    fireEvent.change(screen.getByRole("textbox", { name: "Search campaigns" }), { target: { value: "holiday" } })
    expect(screen.getByText("Holiday plan")).toBeInTheDocument()
    expect(screen.queryByText("Autumn launch")).not.toBeInTheDocument()
  })

  it("only exposes archive controls to users with archive permission", () => {
    const { rerender } = render(<CampaignManager clientId="client-1" campaigns={campaigns} permissions={{ canCreate: true, canUpdate: true, canArchive: false }} />)
    expect(screen.getByText("New campaign")).toBeInTheDocument()
    expect(screen.getAllByText("Edit")).toHaveLength(2)
    expect(screen.queryByText("Archive campaign")).not.toBeInTheDocument()

    rerender(<CampaignManager clientId="client-1" campaigns={campaigns} permissions={{ canCreate: true, canUpdate: true, canArchive: true }} />)
    expect(screen.getAllByText("Archive campaign")).toHaveLength(2)
  })
})
