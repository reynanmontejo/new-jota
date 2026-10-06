import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"
import { getDriveConfig, getGoogleDriveStatus, googleDriveOwnerEmail } from "@/lib/storage/google-drive"
import { MAX_UPLOAD_SIZE_LABEL } from "@/lib/storage/upload-limits"
import { disconnectDriveAction } from "@/app/settings/storage/actions"

export default async function StorageSettingsPage({ searchParams }: { searchParams: Promise<{ drive?: string }> }) {
  const actor = await getStorageActor()
  if (!actor) redirect("/login")
  if (!await hasStoragePermission(actor, ["storage.manage"])) redirect("/clients")
  const [{ drive }, status] = await Promise.all([
    searchParams,
    getDriveConfig()
      ? getGoogleDriveStatus(actor.organizationId).then((value) => ({ available: true, ...value })).catch(() => ({ available: false, connected: false as const, email: null }))
      : Promise.resolve({ available: false, connected: false as const, email: null }),
  ])
  const configured = Boolean(getDriveConfig())

  return <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
    <Link href="/clients" className="text-xs font-medium text-muted-foreground hover:text-foreground">← Back to clients</Link>
    <header className="mt-4"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-primary">Workspace settings</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">File storage</h1><p className="mt-1 text-sm text-muted-foreground">Connect the private Google Drive account used for client files.</p></header>
    <section className="mt-5 rounded-lg border bg-card/80 p-5">
      <h2 className="text-sm font-semibold">Google Drive connection</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">The app creates a private Jota folder and one subfolder per client. Files are downloaded through the signed-in app; no public Drive links are created.</p>
      <div className="mt-4 rounded-md border bg-background/60 p-3 text-xs"><span className="font-medium">Approved account:</span> {googleDriveOwnerEmail}<br /><span className="font-medium">Connection status:</span> {status.connected ? `Connected as ${status.email}` : !configured ? "OAuth values not configured" : !status.available ? "Storage migration or server settings are unavailable" : "Not connected"}</div>
      {drive && <p role={drive === "connected" || drive === "disconnected" ? "status" : "alert"} className="mt-3 text-xs text-muted-foreground">{drive === "connected" ? "Google Drive is connected." : drive === "disconnected" ? "Google Drive was disconnected. Files remain in Drive." : drive === "access-denied" ? "Administrator access is required." : drive === "not-configured" ? "Add the server-side Google OAuth values before connecting." : "Google Drive could not complete that action. Check configuration and try again."}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {!status.connected ? <form action="/api/google-drive/connect" method="get"><Button type="submit" disabled={!configured || !status.available}>Connect Google Drive</Button></form> : <form action={disconnectDriveAction}><Button type="submit" variant="outline">Disconnect account</Button></form>}
        <Button variant="outline" render={<Link href="/settings/storage/files" />}>Manage uploaded files</Button>
      </div>
      {(!configured || !status.available) && <p className="mt-3 text-[11px] text-muted-foreground">Setup guide: <code>docs/google-drive-setup.md</code> in the repository. Add OAuth credentials and apply the local Drive migration before connecting. Never paste the client secret into chat or browser code.</p>}
    </section>
    <section className="mt-4 rounded-lg border border-amber-700/15 bg-amber-700/5 p-4 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Current limits:</strong> {MAX_UPLOAD_SIZE_LABEL} per upload; images, common documents, CSV, MP4 and MOV. Executables and archives are blocked. Administrators can archive and restore unsubmitted files; this hides the file in Jota but retains its private Drive copy. Submitted review history is protected, and files are not permanently deleted automatically. The deployed hosting provider may impose a lower request-size limit.</section>
  </main>
}
