import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/app/content/actions", () => ({ importContentItems: vi.fn() }))

import { ContentImport } from "@/features/content/content-import"

afterEach(cleanup)

describe("content import assignment", () => {
  it("optionally assigns only video rows to the client video editor", async () => {
    const csv = [
      "Content title,Platform,Format",
      "Video announcement,Instagram,Reel",
      "Graphic announcement,Instagram,Static image",
    ].join("\n")
    const file = new File([csv], "content.csv", { type: "text/csv" })
    Object.defineProperty(file, "text", { value: async () => csv })

    const { container } = render(<ContentImport
      clients={[{ id: "client-1", name: "Northwind" }]}
      campaigns={[{ id: "campaign-1", client_id: "client-1", name: "General / Ongoing", status: "active" }]}
      assignees={{ "client-1": [{ id: "supervisor-1", display_name: "Supervisor" }, { id: "editor-1", display_name: "Video Editor" }] }}
      videoEditorByClient={{ "client-1": "editor-1" }}
      items={[]}
      currentUserId="supervisor-1"
      canAssignContent
    />)

    fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText("2 ready to import")).toBeInTheDocument())
    const importedRows = () => JSON.parse((container.querySelector('input[name="rows"]') as HTMLInputElement).value) as Array<{ title: string; assigned_to: string }>
    expect(importedRows().map((row) => row.assigned_to)).toEqual(["supervisor-1", "supervisor-1"])

    fireEvent.change(screen.getByRole("combobox", { name: "Video editor for imported content" }), { target: { value: "editor-1" } })
    expect(importedRows().map((row) => row.assigned_to)).toEqual(["editor-1", "supervisor-1"])
  })
})
