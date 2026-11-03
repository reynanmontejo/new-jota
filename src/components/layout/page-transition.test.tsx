import { useState } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const route = vi.hoisted(() => ({ pathname: "/clients", search: "tab=files" }))
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}))
import { PageTransition } from "./page-transition"

const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate")
const cancel = vi.fn()
const animate = vi.fn(() => ({ cancel }))
const addListener = vi.fn()
const removeListener = vi.fn()
function Page() {
  const [count, setCount] = useState(0)
  return <main><input aria-label="Unsaved note" defaultValue="" /><button onClick={() => setCount(count + 1)}>Count {count}</button></main>
}

beforeEach(() => {
  vi.clearAllMocks()
  route.pathname = "/clients"
  route.search = "tab=files"
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate })
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: addListener, removeEventListener: removeListener })))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  if (originalAnimate) Object.defineProperty(Element.prototype, "animate", originalAnimate)
  else Reflect.deleteProperty(Element.prototype, "animate")
})

describe("shared page motion", () => {
  it("animates navigation and view changes without remounting the page or losing form state", () => {
    const { rerender } = render(<PageTransition><Page /></PageTransition>)
    fireEvent.change(screen.getByLabelText("Unsaved note"), { target: { value: "Keep my changes" } })
    fireEvent.click(screen.getByRole("button", { name: "Count 0" }))
    route.search = "tab=campaigns"
    rerender(<PageTransition><Page /></PageTransition>)
    expect(animate).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText("Unsaved note")).toHaveValue("Keep my changes")
    expect(screen.getByRole("button", { name: "Count 1" })).toBeInTheDocument()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it("does not replay the page entrance for data refreshes, filters, or calendar month changes", () => {
    route.pathname = "/calendar"
    route.search = "month=2026-11"
    const { rerender } = render(<PageTransition><Page /></PageTransition>)
    rerender(<PageTransition><Page /></PageTransition>)
    route.search = "month=2026-12&query=review"
    rerender(<PageTransition><Page /></PageTransition>)
    expect(animate).toHaveBeenCalledOnce()
    route.pathname = "/tasks"
    rerender(<PageTransition><Page /></PageTransition>)
    expect(animate).toHaveBeenCalledTimes(2)
  })

  it("respects reduced motion and can still render usable content", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }))
    render(<PageTransition><Page /></PageTransition>)
    expect(animate).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Unsaved note")).toBeVisible()
  })

  it("cancels the animation when the motion preference changes", () => {
    render(<PageTransition><Page /></PageTransition>)
    const onChange = addListener.mock.calls[0][1] as () => void
    onChange()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it("works when the browser does not expose the animation API", () => {
    Reflect.deleteProperty(Element.prototype, "animate")
    render(<PageTransition><Page /></PageTransition>)
    expect(screen.getByLabelText("Unsaved note")).toBeVisible()
    expect(animate).not.toHaveBeenCalled()
  })
})
