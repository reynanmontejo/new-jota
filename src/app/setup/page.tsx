import { redirect } from "next/navigation"
import { bootstrapAdministrator } from "@/app/setup/actions"
import { createClient } from "@/lib/supabase/server"

const inputClass = "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export default async function InitialSetupPage({ searchParams }: PageProps<"/setup">) {
  const query = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle()
  if (profile) redirect("/profile")

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-4 py-10">
      <section className="w-full rounded-lg border border-border bg-card p-5 shadow-sm sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Joyno Task · First-time setup</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Set up your administrator profile</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Your signed-in account will become the first administrator for this workspace.</p>
        {query.error === "invalid" && <p className="mt-4 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">Check the fields and timezone, then try again.</p>}
        {query.error === "save" && <p className="mt-4 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">Setup could not be saved. The setup migration may not be applied yet, or setup has already started.</p>}
        {query.error === "complete" && <p className="mt-4 rounded-md border border-border bg-muted p-3 text-sm">Initial setup is already complete. Ask an administrator to create your employee profile.</p>}
        <form action={bootstrapAdministrator} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">Organization name<input className={inputClass} name="organizationName" autoComplete="organization" required minLength={2} maxLength={120} placeholder="Your company or team" /></label>
          <label className="block text-sm font-medium">Your name<input className={inputClass} name="displayName" autoComplete="name" required minLength={2} maxLength={120} defaultValue={typeof user.user_metadata.display_name === "string" ? user.user_metadata.display_name : ""} placeholder="Full name" /></label>
          <label className="block text-sm font-medium">Job title <span className="font-normal text-muted-foreground">(optional)</span><input className={inputClass} name="jobTitle" autoComplete="organization-title" maxLength={120} placeholder="e.g. Marketing Manager" /></label>
          <label className="block text-sm font-medium">Workspace timezone<select className={inputClass} name="timezone" defaultValue="America/New_York"><option value="America/New_York">Eastern Time</option><option value="America/Chicago">Central Time</option><option value="America/Denver">Mountain Time</option><option value="America/Los_Angeles">Pacific Time</option><option value="UTC">UTC</option></select></label>
          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Signed in as <span className="font-medium text-foreground">{user.email}</span>. This email and your administrator role are managed separately from editable profile details.</p>
            <button className="mt-4 h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90" type="submit">Create workspace profile</button>
          </div>
        </form>
      </section>
    </main>
  )
}
