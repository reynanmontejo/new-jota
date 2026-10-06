import Link from "next/link"
import { redirect } from "next/navigation"

import { AdminFileManager } from "@/features/storage/admin-file-manager"
import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"

export default async function OrganizationFilesPage() {
  const actor = await getStorageActor()
  if (!actor) redirect("/login")
  if (!await hasStoragePermission(actor, ["storage.manage"])) redirect("/clients")

  return <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <Link href="/settings/storage" className="text-xs font-medium text-muted-foreground hover:text-foreground">← Back to File storage</Link>
    <header className="mt-4"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">Workspace settings / administration</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">File management</h1><p className="mt-1 text-sm text-muted-foreground">Browse and manage files uploaded across the organization.</p></header>
    <AdminFileManager />
  </main>
}
