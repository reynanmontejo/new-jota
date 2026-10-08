"use client"

import { LoaderCircle, Plus, Search, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { MobileNavigation } from "@/components/layout/mobile-navigation"
import { ThemeModeToggle } from "@/components/layout/theme-mode-toggle"
import { NewTaskSheet } from "@/features/tasks/new-task-sheet"
import { useTaskDrawer } from "@/features/tasks/task-drawer"
import { useWorkflow } from "@/features/workflow/workflow-provider"
import { NotificationBell } from "@/features/notifications/notification-bell"
import { searchWorkspace } from "@/features/search/workspace-search"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { createClient as createSupabaseClient } from "@/lib/supabase/client"

type DashboardShellProps = {
  children: React.ReactNode
  compact?: boolean
}

export function DashboardShell({ children, compact = false }: DashboardShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const { openTask } = useTaskDrawer()
  const { currentUser, switchDemoUser, demoMode, error: workflowError, clearError, tasks, clients } = useWorkflow()
  const navigationVariant = currentUser.role === "supervisor" ? "supervisor" : "account_manager"
  const isAdministrator = !demoMode && currentUser.title?.toLowerCase() === "administrator"
  const initials = currentUser.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [taskSheetOpen, setTaskSheetOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [navigationPending, setNavigationPending] = useState(false)
  const searchResults = useMemo(() => searchWorkspace(searchQuery, tasks, clients), [searchQuery, tasks, clients])

  useEffect(() => {
    const timeout = window.setTimeout(() => setNavigationPending(false), 0)
    return () => window.clearTimeout(timeout)
  }, [pathname, searchKey])
  useEffect(() => {
    if (!navigationPending) return
    const timeout = window.setTimeout(() => setNavigationPending(false), 15000)
    return () => window.clearTimeout(timeout)
  }, [navigationPending])

  const handleNavigationClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest("a[href]")
    if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return
    const destination = new URL(anchor.href, window.location.href)
    if (destination.origin !== window.location.origin || destination.pathname.startsWith("/api/")) return
    if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash === window.location.hash) return
    if (navigationPending) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    setNavigationPending(true)
  }, [navigationPending])

  return (
    <div onClickCapture={handleNavigationClick} aria-busy={navigationPending} className={cn("dashboard-canvas min-h-screen text-foreground", compact && "dashboard-canvas--compact")}>
      {navigationPending && <div role="status" aria-live="polite" className="pointer-events-none fixed left-1/2 top-3 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs text-foreground shadow-lg backdrop-blur"><LoaderCircle aria-hidden="true" className="size-3.5 animate-spin text-primary" />Loading page…</div>}
      <AppSidebar
        collapsed={sidebarCollapsed}
        variant={navigationVariant}
        isAdministrator={isAdministrator}
        onToggle={() => setSidebarCollapsed((current) => !current)}
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-background/70 transition-[width] duration-200 lg:flex",
          sidebarCollapsed ? "w-20" : "w-64",
        )}
      />

      <div className={cn("transition-[padding] duration-200", sidebarCollapsed ? "lg:pl-20" : "lg:pl-64")}>
        <header className={cn("glass-header sticky top-0 z-20 flex items-center gap-3 border-b px-4 sm:px-6", compact ? "h-14 lg:px-6" : "h-16 lg:px-8")}>
          <MobileNavigation variant={navigationVariant} isAdministrator={isAdministrator} />
          <div className={cn("relative max-w-lg flex-1", mobileSearchOpen ? "absolute left-3 right-3 top-full z-40 max-w-none rounded-lg border bg-background p-2 shadow-lg md:static md:block md:max-w-lg md:border-0 md:bg-transparent md:p-0 md:shadow-none" : "hidden md:block")}>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
            <input
              type="search"
              role="combobox"
              aria-label="Search tasks, clients, and campaigns"
              aria-expanded={searchOpen && searchQuery.trim().length > 0}
              aria-controls="workspace-search-results"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              placeholder="Search tasks, clients, campaigns..."
              className={cn(
                "w-full border border-primary/35 bg-background/88 pl-9 pr-3 text-foreground outline-none backdrop-blur-md transition placeholder:text-muted-foreground/85 hover:border-primary/50 focus:border-primary focus:bg-background focus:ring-3 focus:ring-primary/15 dark:shadow-none",
                compact
                  ? "h-9 rounded-lg text-xs shadow-sm"
                  : "h-10 rounded-xl text-sm shadow-[inset_0_1px_0_rgb(253_252_251/92%),0_7px_18px_-15px_rgb(94_70_41/60%)]",
              )}
              value={searchQuery}
              onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") { setSearchOpen(false); setMobileSearchOpen(false) }
                if (event.key === "Enter" && searchResults[0]) router.push(searchResults[0].href)
              }}
            />
            {searchOpen && searchQuery.trim() && <div id="workspace-search-results" role="listbox" aria-label="Search results" className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 max-h-96 overflow-auto rounded-lg border border-border bg-popover p-1.5 shadow-xl">
              {searchResults.length ? searchResults.map((result) => <Link key={`${result.type}-${result.id}`} role="option" aria-selected="false" href={result.href} onClick={() => { setSearchOpen(false); setSearchQuery(""); setMobileSearchOpen(false) }} className="flex items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                <span className="mt-0.5 w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary">{result.type}</span>
                <span className="min-w-0"><span className="block truncate text-xs font-medium text-foreground">{result.title}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{result.detail}</span></span>
              </Link>) : <p className="px-3 py-4 text-center text-xs text-muted-foreground">No tasks, clients, or campaigns found.</p>}
            </div>}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="icon" className="border-primary/25 bg-background/70 md:hidden" aria-label={mobileSearchOpen ? "Close search" : "Search"} onClick={() => { setMobileSearchOpen((open) => !open); setSearchOpen(true) }}>
              <Search />
            </Button>
            <Button
              aria-label="Create new task"
              className={cn("border border-primary/60 bg-primary text-primary-foreground hover:bg-primary/88", compact ? "h-8 rounded-lg px-3 text-xs shadow-sm" : "h-9 rounded-xl px-3.5 shadow-[0_12px_24px_-12px_rgb(175_134_83/78%)]")}
              onClick={() => setTaskSheetOpen(true)}
            >
              <Plus data-icon="inline-start" />
              <span className="hidden sm:inline">New task</span>
            </Button>
            <NotificationBell currentUser={currentUser} demoMode={demoMode} compact={compact} onOpenTask={openTask} />
            <ThemeModeToggle />
            <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />
            <DropdownMenu>
              <DropdownMenuTrigger render={<button className={cn("flex items-center gap-2 p-1 text-left transition hover:bg-muted", compact ? "rounded-lg" : "rounded-xl")} aria-label="Open user menu" />}>
                <Avatar className={compact ? "size-7" : "size-8"}>
                  {currentUser.avatarUrl && <AvatarImage src={currentUser.avatarUrl} alt="" />}
                  <AvatarFallback className="bg-gradient-to-br from-secondary/55 to-accent/65 text-xs font-semibold text-foreground ring-1 ring-background">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden pr-1 xl:block">
                  <span className="block text-xs font-semibold leading-tight">{currentUser.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{currentUser.jobTitle ?? currentUser.title ?? (currentUser.role === "supervisor" ? "Supervisor" : "Account Manager")}</span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-lg p-1.5">
                {demoMode ? (
                  <>
                    <DropdownMenuLabel>Demo account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => switchDemoUser("employee")} className="min-h-8 rounded-md px-2 text-xs">Maria Reyes · Employee</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => switchDemoUser("supervisor")} className="min-h-8 rounded-md px-2 text-xs">Sarah Chen · Supervisor</DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuLabel>{currentUser.name}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="min-h-8 rounded-md px-2 text-xs"
                      onClick={() => router.push("/profile")}
                    >
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem className="min-h-8 rounded-md px-2 text-xs" onClick={() => router.push("/settings")}>
                      <Settings className="size-3.5" /> Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="min-h-8 rounded-md px-2 text-xs"
                      onClick={async () => {
                        const supabase = createSupabaseClient()
                        const { error } = await supabase.auth.signOut()
                        if (!error) router.replace("/login")
                      }}
                    >
                      Sign out
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {workflowError && <div className="fixed right-4 top-[4.5rem] z-50 flex max-w-md items-center gap-3 border border-destructive/25 bg-background px-4 py-3 text-xs text-foreground shadow-lg" role="alert"><span>{workflowError}</span><button className="font-semibold text-primary" onClick={clearError}>Dismiss</button></div>}
        {children}
      </div>
      {taskSheetOpen && <NewTaskSheet open={taskSheetOpen} onOpenChange={setTaskSheetOpen} />}
    </div>
  )
}
