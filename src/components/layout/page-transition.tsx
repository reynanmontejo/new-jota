"use client"

import { useLayoutEffect, useRef, type ReactNode } from "react"
import { usePathname, useSearchParams } from "next/navigation"

// Animate the existing page node, never key/remount the workspace or its forms.
// CSS supplies the same entrance when streamed content arrives after this effect.
export function PageTransition({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const search = useSearchParams()
  // These change the page/view. Search filters and calendar month changes have
  // their own local UI and must not restart the entire page animation.
  const routeKey = `${pathname}?tab=${search.get("tab") ?? ""}&view=${search.get("view") ?? ""}`

  useLayoutEffect(() => {
    const surface = container.current?.querySelector("main")
    if (!surface || typeof surface.animate !== "function") return
    const preference = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)") : null
    if (preference?.matches) return
    const animation = surface.animate([
      { opacity: 0, transform: "translate3d(0, 10px, 0)" },
      { opacity: 1, transform: "none" },
    ], { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" })
    const cancel = () => animation.cancel()
    preference?.addEventListener("change", cancel)
    return () => {
      animation.cancel()
      preference?.removeEventListener("change", cancel)
    }
  }, [routeKey])

  return <div ref={container} className="contents">{children}</div>
}
