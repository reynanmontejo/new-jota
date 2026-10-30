import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { PasswordInput } from "./password-input"

afterEach(cleanup)

describe("password visibility", () => {
  it("reveals and hides the typed password without submitting the form or changing its value", () => {
    const submit = vi.fn((event) => event.preventDefault())
    render(<form onSubmit={submit}>
      <label htmlFor="password">Password</label>
      <PasswordInput id="password" name="password" autoComplete="current-password" />
    </form>)
    const input = screen.getByLabelText("Password")
    fireEvent.change(input, { target: { value: "  Example!Password  " } })
    expect(input).toHaveAttribute("type", "password")
    fireEvent.click(screen.getByRole("button", { name: "Show password" }))
    expect(input).toHaveAttribute("type", "text")
    expect(input).toHaveValue("  Example!Password  ")
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }))
    expect(input).toHaveAttribute("type", "password")
    expect(input).toHaveAttribute("autocomplete", "current-password")
    expect(submit).not.toHaveBeenCalled()
  })

  it("keeps a disabled password field and its visibility button disabled", () => {
    render(<PasswordInput aria-label="Password" disabled />)
    expect(screen.getByLabelText("Password")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Show password" })).toBeDisabled()
  })
})
