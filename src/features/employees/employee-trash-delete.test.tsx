import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const remove = vi.hoisted(() => vi.fn())
vi.mock("@/app/employees/actions", () => ({ permanentlyDeleteEmployee: remove }))
import { EmployeeTrashDelete } from "./employee-trash-delete"

const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal")
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close")
beforeEach(() => {
  vi.clearAllMocks()
  remove.mockResolvedValue(undefined)
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
  function openConfirmation() {
    render(<EmployeeTrashDelete employeeId="employee-1" employeeName="Test Employee" employeeEmail="employee@example.com" />)
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }))
    return screen.getByRole("dialog", { name: "Permanently delete Test Employee?" })
  }

  it("opening and cancelling the confirmation does not delete an account", () => {
    const dialog = openConfirmation()
    expect(remove).not.toHaveBeenCalled()
    expect(within(dialog).getByText(/This cannot be undone/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(remove).not.toHaveBeenCalled()
  })

  it("submits the selected account and typed email only after confirmation", async () => {
    const dialog = openConfirmation()
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
    const dialog = openConfirmation()
    fireEvent.change(within(dialog).getByLabelText("Confirm with employee email"), { target: { value: "employee@example.com" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }))
    const deleting = await within(dialog).findByRole("button", { name: "Deleting account…" })
    expect(deleting).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled()
    fireEvent.click(deleting)
    expect(remove).toHaveBeenCalledOnce()
    await act(async () => finish())
  })
})
