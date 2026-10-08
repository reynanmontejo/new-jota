import Link from "next/link"
import { redirect } from "next/navigation"

import { DashboardShell } from "@/components/layout/dashboard-shell"
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
      <header className="mt-4"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">Personal settings</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Settings</h1><p className="mt-1 text-sm text-muted-foreground">Choose how Jota alerts you about new work.</p></header>
      <NotificationSettings userId={userId} demoMode={demoMode} />
    </main>
  </DashboardShell>
}
