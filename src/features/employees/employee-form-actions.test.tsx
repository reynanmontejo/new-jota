import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { EmployeeFormActions } from "./employee-form-actions"

afterEach(cleanup)

describe("employee account pending actions", () => {
  it.each([
    ["create", "Create account", "Creating account…"],
    ["trash", "Move to Trash", "Moving to Trash…"],
  ] as const)("shows progress and prevents repeat %s requests until the action finishes", async (operation, idle, pending) => {
    let finish!: () => void
    const request = new Promise<void>((resolve) => { finish = resolve })
    const action = vi.fn(async () => { await request })
    render(<form action={action}><EmployeeFormActions operation={operation} /></form>)

    fireEvent.click(screen.getByRole("button", { name: idle }))
    const button = await screen.findByRole("button", { name: pending })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("status")).toHaveTextContent(pending)
    fireEvent.click(button)
    expect(action).toHaveBeenCalledOnce()

    await act(async () => finish())
    await waitFor(() => expect(screen.getByRole("button", { name: idle })).toBeEnabled())
    expect(screen.getByRole("button", { name: idle })).toHaveAttribute("aria-busy", "false")
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
  })

  it("disables Cancel while moving an account to Trash, then restores it", async () => {
    let finish!: () => void
    const request = new Promise<void>((resolve) => { finish = resolve })
    const cancel = vi.fn()
    render(<form action={async () => { await request }}><EmployeeFormActions operation="trash" onCancel={cancel} /></form>)

    fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }))
    await screen.findByRole("button", { name: "Moving to Trash…" })
    const cancelButton = screen.getByRole("button", { name: "Cancel" })
    expect(cancelButton).toBeDisabled()
    fireEvent.click(cancelButton)
    expect(cancel).not.toHaveBeenCalled()

    await act(async () => finish())
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(cancel).toHaveBeenCalledOnce()
  })
})
