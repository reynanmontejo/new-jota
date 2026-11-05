import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/app/profile/actions", () => ({ updateOwnProfile: vi.fn(), uploadProfilePhoto: vi.fn(), removeOwnProfilePhoto: vi.fn() }))
import { updateOwnProfile } from "@/app/profile/actions"
import { ProfileEditor } from "@/features/profile/profile-editor"

afterEach(cleanup)
const profile = { displayName: "Reynan", jobTitle: "IT Admin", email: "reynan@example.test", avatarUrl: null }
const renderProfile = (saved = false) => render(<ProfileEditor profile={profile} workspaceName="Joyno Media" roleName="Administrator" saved={saved} />)

describe("Profile presentation and form behavior", () => {
  it("enables save only for actual profile edits and resets saved values on Cancel", () => {
    renderProfile()
    const save = screen.getByRole("button", { name: "Save changes" })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Reynan updated" } })
    expect(save).toBeEnabled()
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Designer" } })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.getByLabelText("Display name")).toHaveValue("Reynan")
    expect(screen.getByLabelText("Job title")).toHaveValue("IT Admin")
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Reynan " } })
    expect(save).toBeDisabled()
  })

  it("shows both role pills and one read-only email without a duplicated identity email", () => {
    renderProfile()
    expect(screen.getAllByText("Administrator")).toHaveLength(2)
    expect(screen.getAllByDisplayValue("reynan@example.test")).toHaveLength(1)
    expect(screen.getByLabelText("Email address")).toHaveAttribute("readonly")
    expect(screen.getByText("Manage how you appear to your team.")).toBeInTheDocument()
  })

  it("includes a personal time zone in saves and restores it on Cancel", () => {
    renderProfile()
    const zone = screen.getByLabelText("Time zone")
    expect(zone).toHaveValue("Asia/Manila")
    expect(zone).toHaveAttribute("name", "timezone")
    fireEvent.change(zone, { target: { value: "UTC" } })
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(zone).toHaveValue("Asia/Manila")
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Change email" }))
    expect(screen.getByLabelText("New email address")).toBeVisible()
    expect(screen.getByRole("button", { name: "Send verification" }).closest("form")?.parentElement?.closest("form")).toBeNull()
  })

  it("keeps the original profile form usable before the additive migration is installed", () => {
    render(<ProfileEditor profile={profile} workspaceName="Joyno Media" roleName="Administrator" preferencesReady={false} />)
    expect(screen.getByLabelText("Time zone")).toBeDisabled()
    expect(screen.getByLabelText("Time zone")).not.toHaveAttribute("name")
    expect(screen.getByRole("button", { name: "Change email" })).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Updated" } })
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled()
  })

  it("announces successful save and hides the old success message when editing again", () => {
    renderProfile(true)
    expect(screen.getByText("Saved")).toHaveAttribute("aria-live", "polite")
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Updated" } })
    expect(screen.queryByText("Saved")).not.toBeInTheDocument()
  })

  it("disables editing and announces a pending save until the action resolves", async () => {
    let finish!: () => void
    vi.mocked(updateOwnProfile).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    renderProfile()
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Reynan Updated" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled()
    expect(screen.getByLabelText("Display name")).toBeDisabled()
    expect(screen.getByText("Saving changes…")).toHaveAttribute("aria-live", "polite")
    await act(async () => finish())
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled()
    expect(screen.queryByText("Saved")).not.toBeInTheDocument()
  })

  it("preserves the photo type/size validation before opening the crop dialog", () => {
    renderProfile()
    expect(screen.getByRole("button", { name: "Change photo" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Choose a profile picture"), { target: { files: [new File(["invalid"], "file.svg", { type: "image/svg+xml" })] } })
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a JPG, PNG, or WEBP image up to 5 MB.")
    const large = new File(["image"], "large.png", { type: "image/png" })
    Object.defineProperty(large, "size", { value: 5 * 1024 * 1024 + 1 })
    fireEvent.change(screen.getByLabelText("Choose a profile picture"), { target: { files: [large] } })
    expect(screen.getByRole("alert")).toHaveTextContent("up to 5 MB")
  })
})
