import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("@/app/profile/email-actions", () => ({ requestOwnEmailChange: vi.fn() }))
import { requestOwnEmailChange } from "@/app/profile/email-actions"
import { ProfileEmailChange } from "./profile-email-change"
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe("email change form", () => {
  it("focuses the first field and shows pending feedback without allowing duplicate submissions", async () => {
    let finish!: (value: { ok: boolean; message: string }) => void
    vi.mocked(requestOwnEmailChange).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    render(<ProfileEmailChange onClose={vi.fn()} />)
    expect(screen.getByLabelText("New email address")).toHaveFocus()
    fireEvent.change(screen.getByLabelText("New email address"), { target: { value: "new@example.test" } })
    fireEvent.change(screen.getByLabelText("Confirm new email address"), { target: { value: "new@example.test" } })
    fireEvent.click(screen.getByRole("button", { name: "Send verification" }))
    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled()
    expect(screen.getByLabelText("New email address")).toBeDisabled()
    await act(async () => finish({ ok: true, message: "Check both inboxes." }))
    expect(screen.getByRole("status")).toHaveTextContent("Check both inboxes.")
    expect(screen.getByRole("button", { name: "Send verification" })).toBeEnabled()
  })
  it("shows a recoverable error and closes the panel without pretending to cancel a pending Auth request", async () => {
    vi.mocked(requestOwnEmailChange).mockResolvedValue({ ok: false, message: "Try again later." })
    const close = vi.fn()
    render(<ProfileEmailChange onClose={close} pendingEmail="pending@example.test" />)
    expect(screen.getByText(/Awaiting confirmation/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("New email address"), { target: { value: "new@example.test" } })
    fireEvent.change(screen.getByLabelText("Confirm new email address"), { target: { value: "new@example.test" } })
    fireEvent.click(screen.getByRole("button", { name: "Send verification" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again later.")
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(close).toHaveBeenCalledTimes(1)
  })
})
