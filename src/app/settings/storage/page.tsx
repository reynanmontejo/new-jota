import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { getStorageActor, hasStoragePermission } from "@/lib/storage/authorization"
import { getDriveConfig, googleDriveOwnerEmail, verifyGoogleDriveConnection } from "@/lib/storage/google-drive"
import { MAX_UPLOAD_SIZE_LABEL } from "@/lib/storage/upload-limits"
import { disconnectDriveAction } from "@/app/settings/storage/actions"

export default async function StorageSettingsPage({ searchParams }: { searchParams: Promise<{ drive?: string }> }) {
  const actor = await getStorageActor()
  if (!actor) redirect("/login")
  if (!await hasStoragePermission(actor, ["storage.manage"])) redirect("/clients")
  const configured = Boolean(getDriveConfig())
  const [{ drive }, status] = await Promise.all([
    searchParams,
    configured
      ? verifyGoogleDriveConnection(actor.organizationId).then((value) => ({ available: true as const, ...value })).catch(() => ({ available: false as const, connected: false as const, email: null, health: "unavailable" as const }))
      : Promise.resolve({ available: false as const, connected: false as const, email: null, health: "configuration_error" as const }),
  ])
  const connectionLabel = !configured ? "OAuth values not configured"
    : !status.available ? "Storage migration or server settings are unavailable"
      : status.health === "ready" ? `Authorization verified for ${status.email}`
        : status.health === "reauthorization_required" ? `Reconnection required for ${status.email}`
          : status.health === "configuration_error" ? "OAuth configuration needs attention"
            : status.health === "unavailable" ? "Authorization could not be verified right now"
              : "Not connected"

  return <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
    <Link href="/clients" className="text-xs font-medium text-muted-foreground hover:text-foreground">← Back to clients</Link>
    <header className="mt-4"><h1 className="text-2xl font-semibold tracking-tight">File storage</h1></header>
    <section className="mt-5 rounded-lg border bg-card/80 p-5">
      <h2 className="text-sm font-semibold">Google Drive connection</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">The app creates a private Jota folder and one subfolder per client. Files are downloaded through the signed-in app; no public Drive links are created.</p>
      <div className="mt-4 rounded-md border bg-background/60 p-3 text-xs"><span className="font-medium">Approved account:</span> {googleDriveOwnerEmail}<br /><span className="font-medium">Connection status:</span> {connectionLabel}</div>
      {status.health === "reauthorization_required" && <p role="alert" className="mt-3 text-xs leading-5 text-amber-800">Google Drive&apos;s saved authorization has expired or been revoked. Previews and uploads may fail until an administrator reconnects the approved account. Reconnecting keeps Jota&apos;s existing folder and file records.</p>}
      {status.connected && status.health === "configuration_error" && <p role="alert" className="mt-3 text-xs leading-5 text-amber-800">Check the server-side Google OAuth configuration before reconnecting. Do not rotate the encryption key used for this connection.</p>}
      {status.connected && status.health === "unavailable" && <p role="status" className="mt-3 text-xs leading-5 text-muted-foreground">Google Drive could not be checked right now. Try again shortly; existing files have not been changed.</p>}
      {drive && <p role={drive === "connected" || drive === "disconnected" ? "status" : "alert"} className="mt-3 text-xs text-muted-foreground">{drive === "connected" ? "Google account authorization was saved. Check the verification status above." : drive === "disconnected" ? "Google Drive was disconnected. Files remain in Drive." : drive === "access-denied" ? "Administrator access is required." : drive === "not-configured" ? "Add the server-side Google OAuth values before connecting." : "Google Drive could not complete that action. Check configuration and try again."}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <form action="/api/google-drive/connect" method="get"><Button type="submit" disabled={!configured || !status.available}>{status.connected ? "Reconnect Google Drive" : "Connect Google Drive"}</Button></form>
        {status.connected && <form action={disconnectDriveAction}><Button type="submit" variant="outline">Disconnect account</Button></form>}
        <Button variant="outline" render={<Link href="/settings/storage/files" />}>Manage uploaded files</Button>
      </div>
      {(!configured || !status.available) && <p className="mt-3 text-[11px] text-muted-foreground">Setup guide: <code>docs/google-drive-setup.md</code> in the repository. Add OAuth credentials and apply the local Drive migration before connecting. Never paste the client secret into chat or browser code.</p>}
    </section>
    <section className="mt-4 rounded-lg border border-amber-700/15 bg-amber-700/5 p-4 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Current limits:</strong> {MAX_UPLOAD_SIZE_LABEL} per upload; images, common documents, CSV, MP4 and MOV. Executables and archives are blocked. Administrators can archive and restore unsubmitted files; this hides the file in Jota but retains its private Drive copy. Submitted review history is protected, and files are not permanently deleted automatically. The deployed hosting provider may impose a lower request-size limit.</section>
  </main>
}
