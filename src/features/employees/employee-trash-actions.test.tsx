import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const remove = vi.hoisted(() => vi.fn())
const restore = vi.hoisted(() => vi.fn())
vi.mock("@/app/employees/actions", () => ({ permanentlyDeleteEmployee: remove, restoreEmployeeFromTrash: restore }))
import { EmployeeTrashActions } from "./employee-trash-actions"

const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal")
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close")
beforeEach(() => {
  vi.clearAllMocks()
  remove.mockResolvedValue(undefined)
  restore.mockResolvedValue(undefined)
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", "") } })
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open") } })
})
afterEach(() => {
  cleanup()
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal)
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal")
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose)
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close")
})

describe("Employee Trash permanent deletion confirmation", () => {
  async function openConfirmation() {
    render(<EmployeeTrashActions employeeId="employee-1" employeeName="Test Employee" employeeEmail="employee@example.com" canRestore canDelete />)
    expect(screen.queryByRole("button", { name: "Delete permanently" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Trash actions for Test Employee" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete permanently" }))
    return screen.getByRole("dialog", { name: "Permanently delete Test Employee?" })
  }

  it("opening and cancelling the confirmation does not delete an account", async () => {
    const dialog = await openConfirmation()
    expect(remove).not.toHaveBeenCalled()
    expect(within(dialog).getByText(/This cannot be undone/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(remove).not.toHaveBeenCalled()
  })

  it("submits the selected account and typed email only after confirmation", async () => {
    const dialog = await openConfirmation()
    const email = within(dialog).getByLabelText("Confirm with employee email")
    expect(email).toBeRequired()
    fireEvent.change(email, { target: { value: "employee@example.com" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }))
    await waitFor(() => expect(remove).toHaveBeenCalledOnce())
    const submitted = remove.mock.calls[0][0] as FormData
    expect(submitted.get("employeeId")).toBe("employee-1")
    expect(submitted.get("confirmationEmail")).toBe("employee@example.com")
  })

  it("blocks another confirmation and Cancel until the deletion finishes", async () => {
    let finish!: () => void
    remove.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    const dialog = await openConfirmation()
    fireEvent.change(within(dialog).getByLabelText("Confirm with employee email"), { target: { value: "employee@example.com" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }))
    const deleting = await within(dialog).findByRole("button", { name: "Deleting account…" })
    expect(deleting).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled()
    fireEvent.click(deleting)
    expect(remove).toHaveBeenCalledOnce()
    await act(async () => finish())
  })

  it("restores only the selected account and blocks repeated actions while restoring", async () => {
    let finish!: () => void
    restore.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    render(<EmployeeTrashActions employeeId="restore-1" employeeName="Restore Employee" employeeEmail="restore@example.com" canRestore canDelete={false} />)
    const trigger = screen.getByRole("button", { name: "Trash actions for Restore Employee" })
    fireEvent.click(trigger)
    expect(screen.queryByRole("menuitem", { name: "Delete permanently" })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole("menuitem", { name: "Restore account" }))
    await waitFor(() => expect(restore).toHaveBeenCalledOnce())
    expect((restore.mock.calls[0][0] as FormData).get("employeeId")).toBe("restore-1")
    expect(trigger).toBeDisabled()
    expect(screen.getByRole("status")).toHaveTextContent("Restoring account…")
    expect(remove).not.toHaveBeenCalled()
    await act(async () => finish())
    expect(trigger).toBeEnabled()
  })

  it("hides expired restore actions and hides the menu when no action is permitted", async () => {
    const { rerender } = render(<EmployeeTrashActions employeeId="expired-1" employeeName="Expired Employee" employeeEmail="expired@example.com" canRestore={false} canDelete />)
    fireEvent.click(screen.getByRole("button", { name: "Trash actions for Expired Employee" }))
    expect(await screen.findByRole("menuitem", { name: "Delete permanently" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Restore account" })).not.toBeInTheDocument()
    rerender(<EmployeeTrashActions employeeId="expired-1" employeeName="Expired Employee" employeeEmail="expired@example.com" canRestore={false} canDelete={false} />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(restore).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
})
