import { redirect } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { updateOwnProfile } from "@/app/profile/actions"
import { createClient } from "@/lib/supabase/server"

const inputClass = "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const query = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile, error } = await supabase.from("profiles")
    .select("display_name,email,avatar_url,job_title,organization_id,status")
    .eq("id", user.id).maybeSingle()
  if (error) return <DashboardShell><main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8"><section role="alert" className="rounded-lg border border-destructive/20 bg-card p-5"><h1 className="text-lg font-semibold">Profile couldn’t be loaded</h1><p className="mt-2 text-sm text-muted-foreground">Your account is signed in, but Jota couldn’t read your profile. Refresh this page to try again. You won’t be sent through setup again.</p><a href="/profile" className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Retry</a></section></main></DashboardShell>
  if (!profile) redirect("/setup")

  const [membershipResult, organizationResult] = await Promise.all([
    supabase.from("user_roles").select("role_id").eq("organization_id", profile.organization_id).eq("user_id", user.id),
    supabase.from("organizations").select("name").eq("id", profile.organization_id).maybeSingle(),
  ])
  const { data: memberships, error: membershipError } = membershipResult
  const { data: roles, error: roleError } = memberships?.length
    ? await supabase.from("roles").select("code, name")
        .eq("organization_id", profile.organization_id).in("id", memberships.map(({ role_id }) => role_id))
    : { data: [], error: null }
  if (membershipError || roleError) return <DashboardShell><main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8"><section role="alert" className="rounded-lg border border-destructive/20 bg-card p-5"><h1 className="text-lg font-semibold">Workspace access couldn’t be loaded</h1><p className="mt-2 text-sm text-muted-foreground">Your profile is available, but Jota couldn’t load its role details. Refresh this page or ask an administrator to check your workspace access.</p><a href="/profile" className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Retry</a></section></main></DashboardShell>
  const role = roles?.find((item) => item.code === "administrator") ?? roles?.[0]
  if (!role) redirect("/access-denied")
  const organization = organizationResult.data
  const initials = profile.display_name.split(/\s+/).map((part: string) => part[0]).join("").slice(0, 2).toUpperCase()

  return (
    <DashboardShell>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5">
          <p className="text-xs font-medium text-muted-foreground">Account</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage the details teammates see about you.</p>
        </div>

        {query.saved === "1" && <p role="status" className="mb-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">Profile saved.</p>}
        {query.saved === "setup" && <p role="status" className="mb-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">Workspace created. Your administrator profile is ready.</p>}
        {query.error && <p role="alert" className="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{query.error === "invalid" ? "Please check the profile fields and try again." : "We could not save your profile. Please try again."}</p>}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <div className="mb-5 flex items-center gap-3 border-b border-border pb-4">
              <Avatar className="size-12"><AvatarImage src={profile.avatar_url ?? undefined} alt="" /><AvatarFallback className="bg-primary/12 font-semibold text-primary">{initials}</AvatarFallback></Avatar>
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{profile.display_name}</p><p className="truncate text-xs text-muted-foreground">{profile.email}</p></div>
            </div>
            <form action={updateOwnProfile} className="space-y-4">
              <label className="block text-sm font-medium">Display name<input className={inputClass} name="displayName" autoComplete="name" defaultValue={profile.display_name} required minLength={2} maxLength={120} /></label>
              <label className="block text-sm font-medium">Job title<input className={inputClass} name="jobTitle" autoComplete="organization-title" defaultValue={profile.job_title ?? ""} maxLength={120} placeholder="Add your title" /></label>
              <label className="block text-sm font-medium">Profile image URL <span className="font-normal text-muted-foreground">(optional)</span><input className={inputClass} name="avatarUrl" type="url" inputMode="url" defaultValue={profile.avatar_url ?? ""} maxLength={2048} placeholder="https://…" /><span className="mt-1 block text-xs font-normal text-muted-foreground">Use a secure HTTPS image URL. Leave blank to use your initials.</span></label>
              <label className="block text-sm font-medium">Email address<input className={inputClass + " opacity-70"} value={profile.email} readOnly aria-readonly="true" /><span className="mt-1 block text-xs font-normal text-muted-foreground">Email changes require a separate verification flow.</span></label>
              <div className="pt-1"><button className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90" type="submit">Save profile</button></div>
            </form>
          </section>

          <aside className="h-fit rounded-lg border border-border bg-card p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Workspace access</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Workspace</dt><dd className="mt-0.5 font-medium">{organization?.name ?? "Workspace"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Role</dt><dd className="mt-0.5 font-medium">{role.name}</dd></div>
            </dl>
            <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">Role and workspace access are managed by your organization’s administrator and can’t be changed from your personal profile.</p>
          </aside>
        </div>
      </main>
    </DashboardShell>
  )
}
