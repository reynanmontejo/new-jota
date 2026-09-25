"use client"

import { Bell, Plus, Search } from "lucide-react"
import { useState } from "react"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { MobileNavigation } from "@/components/layout/mobile-navigation"
import { ThemeModeToggle } from "@/components/layout/theme-mode-toggle"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type DashboardShellProps = {
  children: React.ReactNode
  persona?: {
    initials: string
    name: string
    role: string
  }
  navigationVariant?: "account_manager" | "supervisor"
}

const defaultPersona = { initials: "MR", name: "Maria Reyes", role: "Account Manager" }

export function DashboardShell({ children, persona = defaultPersona, navigationVariant = "account_manager" }: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="dashboard-canvas min-h-screen text-foreground">
      <AppSidebar
        collapsed={sidebarCollapsed}
        variant={navigationVariant}
        onToggle={() => setSidebarCollapsed((current) => !current)}
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-background/70 transition-[width] duration-200 lg:flex",
          sidebarCollapsed ? "w-20" : "w-64",
        )}
      />

      <div className={cn("transition-[padding] duration-200", sidebarCollapsed ? "lg:pl-20" : "lg:pl-64")}>
        <header className="glass-header sticky top-0 z-20 flex h-16 items-center gap-3 border-b px-4 sm:px-6 lg:px-8">
          <MobileNavigation variant={navigationVariant} />
          <div className="relative hidden max-w-lg flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
            <input
              type="search"
              aria-label="Search tasks, clients, and campaigns"
              placeholder="Search tasks, clients, campaigns..."
              className="h-10 w-full rounded-xl border border-primary/35 bg-background/88 pl-9 pr-3 text-sm text-foreground shadow-[inset_0_1px_0_rgb(253_252_251/92%),0_7px_18px_-15px_rgb(94_70_41/60%)] outline-none backdrop-blur-md transition placeholder:text-muted-foreground/85 hover:border-primary/50 focus:border-primary focus:bg-background focus:ring-3 focus:ring-primary/15 dark:shadow-none"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="icon" className="border-primary/25 bg-background/70 md:hidden" aria-label="Search">
              <Search />
            </Button>
            <Button aria-label="Create new task" className="h-9 rounded-xl border border-background/55 bg-gradient-to-br from-primary to-accent px-3.5 text-primary-foreground shadow-[0_12px_24px_-12px_rgb(175_134_83/78%)] hover:from-[#9d7648] hover:to-primary">
              <Plus data-icon="inline-start" />
              <span className="hidden sm:inline">New task</span>
            </Button>
            <Button variant="ghost" size="icon" className="relative rounded-xl" aria-label="Notifications">
              <Bell className="size-[18px]" />
              <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent ring-2 ring-background" />
            </Button>
            <ThemeModeToggle />
            <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />
            <button className="flex items-center gap-2 rounded-xl p-1 text-left transition hover:bg-muted" aria-label="Open user menu">
              <Avatar className="size-8">
                <AvatarFallback className="bg-gradient-to-br from-secondary/55 to-accent/65 text-xs font-semibold text-foreground ring-1 ring-background">{persona.initials}</AvatarFallback>
              </Avatar>
              <span className="hidden pr-1 xl:block">
                <span className="block text-xs font-semibold leading-tight">{persona.name}</span>
                <span className="block text-[11px] text-muted-foreground">{persona.role}</span>
              </span>
            </button>
          </div>
        </header>

        {children}
      </div>
    </div>
  )
}
