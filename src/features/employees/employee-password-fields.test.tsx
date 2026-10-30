import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { EmployeePasswordFields } from "./employee-password-fields"

afterEach(cleanup)

describe("employee password confirmation", () => {
  it("blocks mismatched confirmation and clears the error when it matches", () => {
    render(<form aria-label="Create employee"><EmployeePasswordFields inputClass="" /></form>)
    const password = screen.getByLabelText("Initial password")
    const confirm = screen.getByLabelText("Confirm password") as HTMLInputElement
    fireEvent.change(password, { target: { value: "Example!Password" } })
    fireEvent.change(confirm, { target: { value: "Different!Password" } })
    expect(screen.getByRole("alert")).toHaveTextContent("The passwords do not match.")
    expect(confirm.checkValidity()).toBe(false)
    fireEvent.change(confirm, { target: { value: "Example!Password" } })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(confirm.checkValidity()).toBe(true)
    const submitted = new FormData(screen.getByRole("form", { name: "Create employee" }) as HTMLFormElement)
    expect(submitted.get("password")).toBe("Example!Password")
    expect(submitted.get("confirmPassword")).toBe("Example!Password")
  })

  it("revalidates when the initial password changes after confirmation", () => {
    render(<EmployeePasswordFields inputClass="" />)
    fireEvent.change(screen.getByLabelText("Initial password"), { target: { value: "Example!Password" } })
    const confirm = screen.getByLabelText("Confirm password") as HTMLInputElement
    fireEvent.change(confirm, { target: { value: "Example!Password" } })
    fireEvent.change(screen.getByLabelText("Initial password"), { target: { value: "Revised!Password" } })
    expect(confirm.checkValidity()).toBe(false)
    expect(screen.getByRole("alert")).toHaveTextContent("The passwords do not match.")
  })

  it("requires confirmation and lets each field be revealed independently", () => {
    render(<EmployeePasswordFields inputClass="" />)
    const confirm = screen.getByLabelText("Confirm password") as HTMLInputElement
    expect(confirm.validity.valueMissing).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Show initial password" }))
    expect(screen.getByLabelText("Initial password")).toHaveAttribute("type", "text")
    expect(confirm).toHaveAttribute("type", "password")
    fireEvent.click(screen.getByRole("button", { name: "Show confirm password" }))
    expect(confirm).toHaveAttribute("type", "text")
  })
})
