import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { UploadProgress } from "@/components/states/content-state"

afterEach(cleanup)

describe("upload progress", () => {
  it("hides the progress row after the upload completes", () => {
    render(<UploadProgress fileName="portrait.jpg" progress={100} status="complete" />)
    expect(screen.queryByText("portrait.jpg")).not.toBeInTheDocument()
  })

  it("keeps progress visible while the upload is still running", () => {
    render(<UploadProgress fileName="clip.mp4" progress={48} status="uploading" />)
    expect(screen.getByText("clip.mp4")).toBeInTheDocument()
    expect(screen.getByText("48%")).toBeInTheDocument()
  })
})
