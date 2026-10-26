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
    <header className="mt-4"><h1 className="text-2xl font-semibold tracking-tight">File management</h1></header>
    <AdminFileManager />
  </main>
}
