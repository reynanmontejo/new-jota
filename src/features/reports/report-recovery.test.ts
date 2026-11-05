import { describe, expect, it, vi } from "vitest"
import { clearReportRecovery } from "./report-recovery"
describe("private report recovery", () => {
  it("clears pending report buffers on logout without removing unrelated preferences", () => {
    sessionStorage.setItem("jota-report-recovery:org:user:2026-11-05", "private draft")
    sessionStorage.setItem("jota-report-recovery:org:user:2026-11-04", "another draft")
    sessionStorage.setItem("theme", "light")
    const event = vi.fn(); window.addEventListener("jota:report-signout", event)
    clearReportRecovery()
    expect(sessionStorage.getItem("jota-report-recovery:org:user:2026-11-05")).toBeNull()
    expect(sessionStorage.getItem("jota-report-recovery:org:user:2026-11-04")).toBeNull()
    expect(sessionStorage.getItem("theme")).toBe("light")
    expect(event).toHaveBeenCalledOnce()
    window.removeEventListener("jota:report-signout", event)
  })
})
