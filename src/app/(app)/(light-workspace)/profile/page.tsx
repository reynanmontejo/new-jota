import { redirect } from "next/navigation"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { ProfileEditor } from "@/features/profile/profile-editor"
import styles from "@/features/profile/profile.module.css"
import { ProfileSecurity } from "@/features/profile/profile-security"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

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

  const [membershipResult, organizationResult, preferencesResult] = await Promise.all([
    supabase.from("user_roles").select("role_id").eq("organization_id", profile.organization_id).eq("user_id", user.id),
    supabase.from("organizations").select("name,timezone").eq("id", profile.organization_id).maybeSingle(),
    supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle(),
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
  const passwordNotice = typeof query.password === "string" ? {
    requested: "Password change request sent to your administrators.",
    "already-requested": "You already have a request waiting for review or approval.",
    unavailable: "Password requests are temporarily unavailable. Try again later or contact an administrator.",
    invalid: "The request note is too long. Keep it under 500 characters.",
    "admin-self-service": "Administrators can change their password directly in this section.",
  }[query.password] : undefined
  let passwordRequest: { id: string; status: "pending" | "approved" | "rejected" | "completed" } | null = null
  let passwordRequestsReady = true
  try {
    const service = createServiceClient()
    const result = await service.from("password_change_requests").select("id,status")
      .eq("organization_id", profile.organization_id).eq("user_id", user.id)
      .order("requested_at", { ascending: false }).limit(1).maybeSingle()
    if (result.error) passwordRequestsReady = false
    else if (result.data && ["pending", "approved", "rejected", "completed"].includes(result.data.status)) {
      passwordRequest = { id: result.data.id, status: result.data.status as "pending" | "approved" | "rejected" | "completed" }
    }
  } catch { passwordRequestsReady = false }

  let timezone = preferencesResult.data?.timezone || organization?.timezone || "Asia/Manila"
  try { Intl.DateTimeFormat("en", { timeZone: timezone }) } catch { timezone = "Asia/Manila" }

  return <DashboardShell>
    <ProfileEditor
      profile={{ displayName: profile.display_name, jobTitle: profile.job_title ?? "", email: user.email ?? profile.email, avatarUrl: profile.avatar_url }}
      roleName={role.name}
      workspaceName={organization?.name ?? "Workspace"}
      timezone={timezone}
      preferencesReady={!preferencesResult.error}
      pendingEmail={user.new_email}
      saved={query.saved === "1"}
      notices={<>
        {query.email === "pending" && user.new_email && <p role="status" className={styles.notice}>Your email change is still pending. Confirm the link in the other inbox to finish.</p>}
        {query.email === "checked" && <p role="status" className={styles.notice}>{user.new_email ? "Email confirmation received. Confirm the remaining link in your other inbox to finish." : "Email verified and updated."}</p>}
        {query.email === "confirmation-failed" && <p role="alert" className={styles.notice}>The email link expired or could not be verified. Open it in the browser where you requested the change, or request a new verification link.</p>}
        {query.saved === "setup" && <p role="status" className={styles.notice}>Workspace created. Your administrator profile is ready.</p>}
        {query.photo === "saved" && <p role="status" className={styles.notice}>Profile picture updated.</p>}
        {query.photo === "removed" && <p role="status" className={styles.notice}>Profile picture removed.</p>}
        {query.photo && !["saved", "removed"].includes(String(query.photo)) && <p role="alert" className={`${styles.notice} text-destructive`}>{query.photo === "invalid" ? "Choose a valid JPG, PNG, or WEBP image no larger than 5 MB." : query.photo === "upload-failed" ? "Profile photo storage is unavailable. Confirm the profile-avatars bucket and its upload policy exist; if not, apply supabase/migrations/202610230001_profile_photos_and_password_approval.sql in Supabase." : "The profile picture could not be saved. Try again."}</p>}
        {passwordNotice && <p role="status" className={styles.notice}>{passwordNotice}</p>}
        {query.error && <p role="alert" className={`${styles.notice} text-destructive`}>{query.error === "preferences-unavailable" ? "Apply the profile preferences migration before saving your time zone." : query.error === "invalid" ? "Please check the profile fields and try again." : "We could not save your profile. Please try again."}</p>}
      </>}
    >
      <ProfileSecurity email={user.email ?? profile.email} isAdministrator={role.code === "administrator"} request={passwordRequest} requestsReady={passwordRequestsReady} />
    </ProfileEditor>
  </DashboardShell>
}
