"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BriefcaseBusiness,
  CalendarDays,
  CircleHelp,
  FileStack,
  FolderKanban,
  Gauge,
  LayoutList,
  Megaphone,
  PanelLeftClose,
  PanelRightOpen,
  SendToBack,
  Settings2,
  Users,
  Wrench,
} from "lucide-react"

import { cn } from "@/lib/utils"

type NavigationItem = {
  name: string
  href: string
  icon: typeof Gauge
  count?: number
}

const accountManagerNavigation: NavigationItem[] = [
  { name: "Overview", href: "/", icon: Gauge },
  { name: "My tasks", href: "/tasks", icon: LayoutList, count: 4 },
  { name: "Calendar", href: "/clients/luma-skincare?tab=calendar", icon: CalendarDays },
  { name: "Campaigns", href: "/clients/luma-skincare?tab=campaigns", icon: Megaphone },
  { name: "Files", href: "/clients/luma-skincare?tab=files", icon: FileStack },
]

const accountManagerWorkspace: NavigationItem[] = [
  { name: "Clients", href: "/clients/luma-skincare", icon: BriefcaseBusiness },
  { name: "Company tools", href: "/states", icon: Wrench },
]

const supervisorNavigation: NavigationItem[] = [
  { name: "Dashboard", href: "/", icon: Gauge },
  { name: "Clients", href: "/clients/luma-skincare", icon: BriefcaseBusiness },
  { name: "Team tasks", href: "/tasks", icon: Users },
  { name: "Reviews", href: "/reviews", icon: SendToBack, count: 1 },
  { name: "Calendar", href: "/clients/luma-skincare?tab=calendar", icon: CalendarDays },
  { name: "Campaigns", href: "/clients/luma-skincare?tab=campaigns", icon: Megaphone },
  { name: "Files", href: "/clients/luma-skincare?tab=files", icon: FileStack },
]

type AppSidebarProps = {
  className?: string
  collapsed?: boolean
  onToggle?: () => void
  variant?: "account_manager" | "supervisor"
}

export function AppSidebar({ className, collapsed = false, onToggle, variant = "account_manager" }: AppSidebarProps) {
  const pathname = usePathname() ?? "/"
  const navigation = variant === "supervisor" ? supervisorNavigation : accountManagerNavigation

  function isActive(item: NavigationItem) {
    const path = item.href.split("?")[0]
    if (item.name === "Clients" && pathname.startsWith("/clients")) return true
    if (item.href.includes("?")) return false
    if (path === "/") return pathname === "/"
    return pathname === path || pathname.startsWith(`${path}/`)
  }

  function navigationLink(item: NavigationItem) {
    const Icon = item.icon
    const active = isActive(item)

    return (
      <Link
        key={item.name}
        href={item.href}
        className={cn(
          "group flex h-10 items-center rounded-xl border text-sm font-medium transition",
          collapsed ? "justify-center px-0" : "gap-3 px-3",
          active
            ? "border-primary/45 bg-gradient-to-r from-primary/25 to-secondary/22 text-foreground shadow-[0_10px_22px_-16px_rgb(94_70_41/65%)]"
            : "border-transparent text-muted-foreground hover:border-primary/15 hover:bg-background/58 hover:text-foreground",
        )}
        title={collapsed ? item.name : undefined}
      >
        <Icon className={cn("size-[17px]", active ? "text-primary" : "text-primary/65 group-hover:text-primary")} />
        <span className={cn("flex-1", collapsed && "sr-only")}>{item.name}</span>
        {item.count && !collapsed && (
          <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", active ? "bg-secondary/28 text-foreground" : "bg-primary/10 text-muted-foreground")}>{item.count}</span>
        )}
      </Link>
    )
  }

  return (
    <aside className={cn("sidebar-glass relative flex h-full flex-col text-foreground", className)}>
      <div className={cn("flex h-16 items-center border-b border-primary/10 px-4", collapsed ? "justify-center" : "justify-start")}>
        <Link href="/" className="flex items-center gap-2.5" aria-label="Northstar home">
          <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-foreground shadow-[0_10px_22px_-10px_rgb(175_134_83/72%)] ring-1 ring-background/80">
            <FolderKanban className="size-[18px]" strokeWidth={2.2} />
          </span>
          <span className={cn(collapsed && "hidden")}>
            <span className="block text-sm font-semibold leading-4 tracking-tight">Northstar</span>
            <span className="block text-[10px] font-semibold tracking-[0.14em] text-primary">MARKETING OPS</span>
          </span>
        </Link>
      </div>

      {onToggle && (
        <button
          onClick={onToggle}
          className="absolute -right-3 top-20 z-10 grid size-7 place-items-center rounded-full border border-primary/30 bg-background text-primary shadow-[0_8px_18px_-10px_rgb(94_70_41/70%)] transition hover:scale-105 hover:border-primary hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Minimize sidebar"}
          title={collapsed ? "Expand sidebar" : "Minimize sidebar"}
        >
          {collapsed ? <PanelRightOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
        </button>
      )}

      <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-4" aria-label="Primary navigation">
        <p className={cn("px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary", collapsed && "sr-only")}>
          {variant === "supervisor" ? "Supervision" : "Work"}
        </p>
        <div className="space-y-1">{navigation.map(navigationLink)}</div>

        {variant === "account_manager" && (
          <>
            <p className={cn("px-3 pb-2 pt-7 text-[10px] font-bold uppercase tracking-[0.16em] text-primary", collapsed && "sr-only")}>Workspace</p>
            <div className="space-y-1">{accountManagerWorkspace.map(navigationLink)}</div>
          </>
        )}
      </nav>

      <div className="space-y-1 border-t border-primary/10 p-3">
        <Link href="#help" title={collapsed ? "Help center" : undefined} className={cn("flex h-9 items-center rounded-xl text-xs font-medium text-muted-foreground transition hover:bg-background/58 hover:text-foreground", collapsed ? "justify-center" : "gap-3 px-3")}>
          <CircleHelp className="size-4" /> <span className={cn(collapsed && "sr-only")}>Help center</span>
        </Link>
        <Link href="#settings" title={collapsed ? "Settings" : undefined} className={cn("flex h-9 items-center rounded-xl text-xs font-medium text-muted-foreground transition hover:bg-background/58 hover:text-foreground", collapsed ? "justify-center" : "gap-3 px-3")}>
          <Settings2 className="size-4" /> <span className={cn(collapsed && "sr-only")}>Settings</span>
        </Link>
      </div>
    </aside>
  )
}
