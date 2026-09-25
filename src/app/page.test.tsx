import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import Home from "./page"

describe("Account Manager dashboard", () => {
  it("keeps urgent work and scheduled content visible as separate concepts", () => {
    render(<Home />)

    expect(screen.getByRole("heading", { level: 1, name: "Good morning, Maria" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Task summary" })).toHaveTextContent("Changes requested")
    expect(screen.getByRole("heading", { level: 2, name: "Today’s focus" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Upcoming content" })).toBeInTheDocument()
    expect(screen.getByText("Finalize launch-day captions")).toBeInTheDocument()
    expect(screen.getByText("Founder story reel")).toBeInTheDocument()
  })
})
