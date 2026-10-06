"use client"

import { Moon, Sun } from "lucide-react"
import { useEffect, useSyncExternalStore, type MouseEvent } from "react"

import { cn } from "@/lib/utils"

type ThemeMode = "light" | "dark"

const themeStorageKey = "jota-color-theme"
const legacyThemeStorageKey = "northstar-color-theme"
const themeChangeEvent = "jota-theme-change"

type ThemeViewTransition = {
  ready: Promise<void>
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ThemeViewTransition
}

function getStoredTheme(): ThemeMode {
  const stored = window.localStorage.getItem(themeStorageKey) ?? window.localStorage.getItem(legacyThemeStorageKey)
  return stored === "dark" ? "dark" : "light"
}

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener(themeChangeEvent, onStoreChange)
  window.addEventListener("storage", onStoreChange)

  return () => {
    window.removeEventListener(themeChangeEvent, onStoreChange)
    window.removeEventListener("storage", onStoreChange)
  }
}

export function ThemeModeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getStoredTheme, () => "light")

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.documentElement.style.colorScheme = theme
  }, [theme])

  function applyTheme(nextTheme: ThemeMode) {
    document.documentElement.classList.toggle("dark", nextTheme === "dark")
    document.documentElement.style.colorScheme = nextTheme
    window.localStorage.setItem(themeStorageKey, nextTheme)
    window.dispatchEvent(new Event(themeChangeEvent))
  }

  async function changeTheme(event: MouseEvent<HTMLButtonElement>, nextTheme: ThemeMode) {
    if (theme === nextTheme) return

    const transitionDocument = document as ViewTransitionDocument
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (!transitionDocument.startViewTransition || reduceMotion) {
      applyTheme(nextTheme)
      return
    }

    const trigger = event.currentTarget.getBoundingClientRect()
    const x = trigger.left + trigger.width / 2
    const y = trigger.top + trigger.height / 2
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )

    const transition = transitionDocument.startViewTransition(() => applyTheme(nextTheme))

    try {
      await transition.ready
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 650,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      )
    } catch {
      // The theme has already been applied; unsupported animation details can fail safely.
    }
  }

  return (
    <div className="flex h-9 items-center rounded-xl border border-primary/25 bg-background/68 p-1 shadow-[inset_0_1px_0_rgb(253_252_251/70%)]" aria-label="Color theme">
      <button
        type="button"
        aria-label="Use light mode"
        aria-pressed={theme === "light"}
        onClick={(event) => void changeTheme(event, "light")}
        className={cn(
          "grid size-7 place-items-center rounded-lg transition",
          theme === "light" ? "bg-secondary/55 text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted",
        )}
      >
        <Sun className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Use dark mode"
        aria-pressed={theme === "dark"}
        onClick={(event) => void changeTheme(event, "dark")}
        className={cn(
          "grid size-7 place-items-center rounded-lg transition",
          theme === "dark" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted",
        )}
      >
        <Moon className="size-3.5" />
      </button>
    </div>
  )
}
