import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/app/content/actions", () => ({ saveContentItem: vi.fn(), archiveContentItem: vi.fn(), recordExternalClientDecision: vi.fn(), restoreContentItem: vi.fn(), sendApprovedContentToClient: vi.fn() }))
vi.mock("@/features/clients/client-files", () => ({ ClientFiles: () => null }))
vi.mock("@/features/content/content-import", () => ({ ContentImport: () => null }))
vi.mock("@/features/tasks/task-drawer", () => ({ useTaskDrawer: () => ({ openNewTask: vi.fn() }) }))

import { isVideoContentFormat, suggestedContentAssignee } from "@/features/content/content-assignment"
import { ContentTracker } from "@/features/content/content-tracker"

afterEach(cleanup)

describe("client Video Editor defaults", () => {
  const members = [{ id: "manager-1", display_name: "Account Manager" }, { id: "editor-1", display_name: "Video Editor" }]

  it("suggests an active client editor for clear video formats and keeps unknown formats unclassified", () => {
    expect(isVideoContentFormat("Instagram Reel")).toBe(true)
    expect(isVideoContentFormat("Short-form video")).toBe(true)
    expect(isVideoContentFormat("Story")).toBe(false)
    expect(suggestedContentAssignee("Reel", "editor-1", "manager-1", members)).toBe("editor-1")
    expect(suggestedContentAssignee("Static image", "editor-1", "manager-1", members)).toBe("manager-1")
    expect(suggestedContentAssignee("Reel", "removed-editor", "manager-1", members)).toBe("manager-1")
    expect(suggestedContentAssignee("Reel", undefined, "supervisor-1", members)).toBe("")
  })

  it("prefills video work but preserves an explicit creator/editor choice", () => {
    render(<ContentTracker
      clients={[{ id: "client-1", name: "Northwind" }, { id: "client-2", name: "Contoso" }]}
      campaigns={[]}
      assignees={{ "client-1": members, "client-2": [{ id: "manager-1", display_name: "Account Manager" }, { id: "editor-2", display_name: "Second Video Editor" }] }}
      videoEditorByClient={{ "client-1": "editor-1", "client-2": "editor-2" }}
      items={[]}
      canCreate canEdit canCreateTask={false} canAssignContent={false}
      currentUserId="manager-1"
    />)

    const format = screen.getByRole("textbox", { name: "Format" })
    const assignee = screen.getByRole("combobox", { name: /Assigned creator \/ editor/ }) as HTMLSelectElement
    expect(assignee.value).toBe("manager-1")

    fireEvent.change(format, { target: { value: "Reel" } })
    expect(assignee.value).toBe("editor-1")
    const videoEditor = screen.getByRole("combobox", { name: "Video editor (optional)" }) as HTMLSelectElement
    expect(videoEditor.value).toBe("editor-1")
    fireEvent.change(videoEditor, { target: { value: "" } })
    expect(assignee.value).toBe("manager-1")
    fireEvent.change(videoEditor, { target: { value: "editor-1" } })
    expect(assignee.value).toBe("editor-1")
    fireEvent.change(assignee, { target: { value: "" } })
    fireEvent.change(format, { target: { value: "Static image" } })
    fireEvent.change(format, { target: { value: "Video clip" } })
    expect(assignee.value).toBe("")

    fireEvent.change(screen.getByRole("combobox", { name: "Client" }), { target: { value: "client-2" } })
    expect(assignee.value).toBe("editor-2")
  })

  it("lets a supervisor select their own account for content creation", () => {
    render(<ContentTracker
      clients={[{ id: "client-1", name: "Northwind" }]}
      campaigns={[]}
      assignees={{ "client-1": [{ id: "supervisor-1", display_name: "Supervisor" }, ...members] }}
      videoEditorByClient={{ "client-1": "editor-1" }}
      items={[]}
      canCreate canEdit canCreateTask={false} canAssignContent
      currentUserId="supervisor-1"
    />)

    const assignee = screen.getByRole("combobox", { name: /Assigned creator \/ editor/ }) as HTMLSelectElement
    expect(assignee.value).toBe("supervisor-1")
    expect(screen.getByRole("option", { name: "Supervisor" })).toBeInTheDocument()
  })
})
