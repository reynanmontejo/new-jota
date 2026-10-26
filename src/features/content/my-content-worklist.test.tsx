import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const actionMocks = vi.hoisted(() => ({ archiveContentItem: vi.fn(), recordExternalClientDecision: vi.fn(), restoreContentItem: vi.fn(), sendApprovedContentToClient: vi.fn() }))
vi.mock("@/app/content/actions", () => ({ ...actionMocks, saveContentItem: vi.fn(), setContentCategory: vi.fn() }))
vi.mock("@/features/clients/client-files", () => ({ ClientFiles: () => <div>Loaded file workspace</div> }))
vi.mock("@/features/content/content-import", () => ({ ContentImport: () => null }))
vi.mock("@/features/tasks/task-drawer", () => ({ useTaskDrawer: () => ({ openNewTask: vi.fn(), openTask: vi.fn() }) }))
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.ComponentProps<"a"> & { href: string }) => <a href={href} {...props}>{children}</a> }))

import { ContentTracker, getContentSummaryCounts, type TrackerItem } from "@/features/content/content-tracker"

afterEach(cleanup)

afterEach(() => { vi.clearAllMocks() })

const items: TrackerItem[] = [
  {
    id: "item-1", client_id: "client-1", campaign_id: "campaign-1", title: "October product reel", platform: "Instagram / Facebook", content_type: "Reel", content_category: "video", content_category_manual: false, description: null,
    status: "in_production", work_date: "2026-10-06", deadline_at: "2026-10-08", publish_at: "2026-10-10T09:00:00Z", client_approval_status: null, client_issues: null,
    notes: null, revision_count: 0, revision_notes: null, next_action: "Finish first cut", assigned_to: "editor-1", client_name: "Northwind", campaign_name: "October", assignee_name: "Editor",
  },
  {
    id: "item-2", client_id: "client-2", campaign_id: "campaign-2", title: "November announcement", platform: "LinkedIn", content_type: "Graphic", content_category: "static", content_category_manual: false, description: null,
    status: "planned", work_date: null, deadline_at: null, publish_at: null, client_approval_status: null, client_issues: null,
    notes: null, revision_count: 0, revision_notes: null, next_action: null, assigned_to: null, client_name: "Contoso", campaign_name: "November", assignee_name: null,
  },
]

describe("unified content tracker", () => {
  it("counts future planned posts as upcoming and flags unresolved overdue content", () => {
    const summary = getContentSummaryCounts([
      { ...items[0], id: "future-planned", status: "planned", publish_at: "2026-10-21T12:00:00", deadline_at: null },
      { ...items[0], id: "today-scheduled", status: "scheduled", publish_at: "2026-10-20T12:00:00", deadline_at: null },
      { ...items[0], id: "unscheduled", status: "planned", publish_at: null, deadline_at: null },
      { ...items[0], id: "missed-publish", status: "planned", publish_at: "2026-10-19T12:00:00", deadline_at: null },
      { ...items[0], id: "overdue-production", status: "in_production", publish_at: "2026-10-21T12:00:00", deadline_at: "2026-10-19" },
      { ...items[0], id: "awaiting-review", status: "for_review", publish_at: null, deadline_at: "2026-10-22" },
      { ...items[0], id: "due-today", status: "in_production", publish_at: null, deadline_at: "2026-10-20" },
      { ...items[0], id: "published", status: "published", publish_at: "2026-10-19T12:00:00", deadline_at: "2026-10-18" },
      { ...items[0], id: "cancelled", status: "cancelled", publish_at: "2026-10-19T12:00:00", deadline_at: "2026-10-18" },
    ], "2026-10-20")

    expect(summary).toEqual({ upcomingCount: 2, attentionCount: 3 })
  })

  it("shows content, owner and workflow details, and can search it", () => {
    render(<ContentTracker clients={[{ id: "client-1", name: "Northwind" }, { id: "client-2", name: "Contoso" }]} campaigns={[]} assignees={{}} items={items} canCreate={false} canEdit={false} canCreateTask={false} currentUserId="user-1" canAssignContent={false} />)

    expect(screen.getByRole("heading", { name: "Content tracker" })).toBeInTheDocument()
    expect(screen.getByText("All content")).toBeInTheDocument()
    expect(screen.getByText("Upcoming")).toBeInTheDocument()
    expect(screen.getByText("Needs attention")).toBeInTheDocument()
    expect(screen.getAllByRole("article")).toHaveLength(2)
    fireEvent.click(screen.getAllByText("More details")[0])
    expect(screen.getByText("Next: Finish first cut")).toBeInTheDocument()
    expect(screen.getByText("Creator/editor: Editor")).toBeInTheDocument()

    fireEvent.change(screen.getByRole("textbox", { name: "Search content" }), { target: { value: "contoso" } })
    expect(screen.getByText("November announcement")).toBeInTheDocument()
    expect(screen.queryByText("October product reel")).not.toBeInTheDocument()
  })

  it("offers a client handoff only to the assigned Account Manager after internal approval", () => {
    const approvedItem: TrackerItem = { ...items[0], latest_approved_version_id: "version-2", client_handoff_version_id: null }
    const renderTracker = (accountManagerClientIds: string[], item = approvedItem) => render(<ContentTracker
      clients={[]} campaigns={[]} assignees={{}} items={[item]} canCreate={false} canEdit canCreateTask={false}
      currentUserId="manager-1" canAssignContent={false} accountManagerClientIds={accountManagerClientIds}
    />)

    const outsideManager = renderTracker([])
    expect(screen.queryByRole("button", { name: "Mark sent to client" })).not.toBeInTheDocument()
    outsideManager.unmount()

    const assignedManager = renderTracker(["client-1"])
    expect(screen.getByRole("button", { name: "Mark sent to client" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Record response" })).not.toBeInTheDocument()
    assignedManager.unmount()

    renderTracker(["client-1"], { ...approvedItem, status: "waiting_client", client_approval_status: "pending", client_handoff_version_id: "version-2" })
    expect(screen.queryByRole("button", { name: "Mark sent to client" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Record response" })).toBeInTheDocument()
  })

  it("does not load file workspaces until a content disclosure is opened", () => {
    render(<ContentTracker clients={[]} campaigns={[]} assignees={{}} items={items} canCreate={false} canEdit={false} canCreateTask={false} currentUserId="user-1" canAssignContent={false} />)

    expect(screen.queryByText("Loaded file workspace")).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole("button", { name: "Files and review" })[0])
    expect(screen.getByText("Loaded file workspace")).toBeInTheDocument()
  })

  it("opens content editing in a responsive sheet instead of an in-card popover", () => {
    render(<ContentTracker clients={[]} campaigns={[]} assignees={{}} items={items} canCreate={false} canEdit canCreateTask={false} currentUserId="user-1" canAssignContent={false} />)

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0])

    const editor = screen.getByRole("dialog", { name: "Edit content" })
    expect(editor).toHaveTextContent("October product reel · Northwind")
    expect(editor).toHaveAttribute("data-slot", "sheet-content")
    expect(editor).toHaveClass("lg:!right-4", "lg:!top-20", "lg:!max-w-[calc(100vw-18rem)]")
    expect(editor.querySelector(".overscroll-contain")).toHaveClass("overflow-y-auto")
    expect(screen.getByRole("combobox", { name: "Reporting category" })).toHaveValue("auto")
    expect(screen.getByRole("button", { name: "Save category" })).toBeInTheDocument()
  })

  it("offers scheduling only after the latest reviewed version has client approval", () => {
    const renderEditor = (item: TrackerItem) => render(<ContentTracker
      clients={[]} campaigns={[]} assignees={{}} items={[item]} canCreate={false} canEdit
      canCreateTask={false} currentUserId="user-1" canAssignContent={false}
    />)
    const unapproved = renderEditor(items[0])
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    expect(screen.getByRole("combobox", { name: /^Status/ }).querySelector('option[value="scheduled"]')).toBeNull()
    expect(screen.getByRole("combobox", { name: /^Status/ }).querySelector('option[value="published"]')).toBeNull()
    unapproved.unmount()

    renderEditor({ ...items[0], client_approval_status: "approved", client_handoff_version_id: "version-2", latest_approved_version_id: "version-2" })
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    expect(screen.getByRole("combobox", { name: /^Status/ }).querySelector('option[value="scheduled"]')).not.toBeNull()
    expect(screen.getByRole("combobox", { name: /^Status/ }).querySelector('option[value="published"]')).not.toBeNull()
  })

  it("archives an item with an undo option and restores it", async () => {
    actionMocks.archiveContentItem.mockResolvedValue({ ok: true })
    actionMocks.restoreContentItem.mockResolvedValue({ ok: true })
    render(<ContentTracker clients={[]} campaigns={[]} assignees={{}} items={items} canCreate={false} canEdit canCreateTask={false} currentUserId="user-1" canAssignContent={false} />)

    fireEvent.click(screen.getAllByText("Edit")[0])
    fireEvent.click(screen.getAllByRole("button", { name: "Archive item" })[0])
    expect(await screen.findByText("“October product reel” archived.")).toBeInTheDocument()
    expect(screen.queryByText("October product reel")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(await screen.findByText("“October product reel” restored.")).toBeInTheDocument()
    expect(actionMocks.archiveContentItem).toHaveBeenCalledWith("item-1")
    expect(actionMocks.restoreContentItem).toHaveBeenCalledWith("item-1")
  })

  it("shows an in-progress indicator and keeps the item visible when archive fails", async () => {
    let resolveArchive: ((value: { ok: true } | { ok: false; error: string }) => void) | undefined
    actionMocks.archiveContentItem.mockImplementation(() => new Promise((resolve) => { resolveArchive = resolve }))
    render(<ContentTracker clients={[]} campaigns={[]} assignees={{}} items={items} canCreate={false} canEdit canCreateTask={false} currentUserId="user-1" canAssignContent={false} />)

    fireEvent.click(screen.getAllByText("Edit")[0])
    fireEvent.click(screen.getAllByRole("button", { name: "Archive item" })[0])
    expect(screen.getByRole("button", { name: "Archiving…" })).toBeDisabled()

    await act(async () => { resolveArchive?.({ ok: false, error: "The content could not be archived." }) })
    expect(screen.getByRole("alert")).toHaveTextContent("The content could not be archived.")
    expect(screen.getByText("October product reel")).toBeInTheDocument()
  })

  it("offers restore actions in the archived view", async () => {
    actionMocks.restoreContentItem.mockResolvedValue({ ok: true })
    render(<ContentTracker clients={[]} campaigns={[]} assignees={{}} items={[items[0]]} canCreate={false} canEdit canCreateTask={false} currentUserId="user-1" canAssignContent={false} isArchivedView />)

    expect(screen.getByRole("heading", { name: "Archived content" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Restore" }))
    expect(await screen.findByText("“October product reel” restored to active content.")).toBeInTheDocument()
    expect(actionMocks.restoreContentItem).toHaveBeenCalledWith("item-1")
  })

  it("paginates content in groups of ten and supports the compact list view", () => {
    const manyItems = Array.from({ length: 12 }, (_, index) => ({ ...items[0], id: `item-${index + 1}`, title: `Content ${index + 1}` }))
    render(<ContentTracker clients={[]} campaigns={[]} assignees={{}} items={manyItems} canCreate={false} canEdit={false} canCreateTask={false} currentUserId="user-1" canAssignContent={false} />)

    expect(screen.getAllByRole("article")).toHaveLength(10)
    expect(screen.getByText("Content 1")).toBeInTheDocument()
    expect(screen.queryByText("Content 11")).not.toBeInTheDocument()
    expect(screen.getByText("Showing 1–10 of 12")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    expect(screen.getAllByRole("article")).toHaveLength(2)
    expect(screen.getByText("Content 11")).toBeInTheDocument()
    expect(screen.getByText("Showing 11–12 of 12")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "List" }))
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getAllByRole("article")).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }))
    expect(screen.getAllByRole("article")).toHaveLength(10)
  })
})
