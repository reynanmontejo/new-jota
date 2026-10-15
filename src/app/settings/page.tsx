import Link from "next/link"
import { redirect } from "next/navigation"
import { Palette } from "lucide-react"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { ThemeModeToggle } from "@/components/layout/theme-mode-toggle"
import { NotificationSettings } from "@/features/notifications/notification-settings"
import { isSupabaseConfigured } from "@/lib/env"
import { getStorageActor } from "@/lib/storage/authorization"

export default async function SettingsPage() {
  const demoMode = !isSupabaseConfigured()
  const actor = demoMode ? null : await getStorageActor()
  if (!demoMode && !actor) redirect("/login")
  const userId = actor?.userId ?? "demo-user"

  return <DashboardShell>
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/" className="text-xs font-medium text-muted-foreground hover:text-foreground">← Back to workspace</Link>
      <header className="mt-4"><h1 className="text-2xl font-semibold tracking-tight">Settings</h1></header>
      <section className="mt-5 rounded-lg border bg-card/80 p-5" aria-labelledby="appearance-heading">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary/35 text-primary"><Palette className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="appearance-heading" className="text-sm font-semibold">Appearance</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Choose light or dark mode. This also updates the quick theme control in the top bar.</p>
          </div>
          <ThemeModeToggle />
        </div>
      </section>
      <NotificationSettings userId={userId} demoMode={demoMode} />
    </main>
  </DashboardShell>
}
