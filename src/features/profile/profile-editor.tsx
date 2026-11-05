"use client"

import { useState, type ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { LoaderCircle } from "lucide-react"

import { updateOwnProfile } from "@/app/profile/actions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProfileEmailChange } from "@/features/profile/profile-email-change"
import { ProfilePhotoUploadForm } from "@/features/profile/profile-photo-upload-form"
import styles from "@/features/profile/profile.module.css"

export type ProfileEditorData = { displayName: string; jobTitle: string; email: string; avatarUrl: string | null }

export function ProfileEditor({ profile, roleName, workspaceName, timezone = "Asia/Manila", saved = false, preferencesReady = true, pendingEmail, notices, children }: {
  profile: ProfileEditorData
  roleName: string
  workspaceName: string
  timezone?: string
  saved?: boolean
  preferencesReady?: boolean
  pendingEmail?: string
  notices?: ReactNode
  children?: ReactNode
}) {
  const [emailOpen, setEmailOpen] = useState(false)
  const initials = profile.displayName.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
  return <main className={styles.page}>
    <header className={styles.heading}><h1>Profile</h1><p>Manage how you appear to your team.</p></header>
    {notices}
    <div className={styles.layout}>
      <div className={styles.mainColumn}>
        <section className={styles.surface} aria-label="Personal profile">
          <div className={styles.identity}>
            <Avatar className={styles.avatar}><AvatarImage src={profile.avatarUrl ?? undefined} alt="" /><AvatarFallback className={styles.avatarFallback}>{initials}</AvatarFallback></Avatar>
            <div className={styles.identityCopy}>
              <div className={styles.nameRow}><h2 className={styles.name}>{profile.displayName}</h2><Badge className={styles.role}>{roleName}</Badge></div>
              <p className={styles.description}>{[profile.jobTitle, workspaceName].filter(Boolean).join(" · ")}</p>
              <ProfilePhotoUploadForm hasPhoto={Boolean(profile.avatarUrl)} />
            </div>
          </div>
          <form action={updateOwnProfile}>
            <ProfileFields key={JSON.stringify([profile.displayName, profile.jobTitle, timezone, saved])} profile={profile} timezone={timezone} saved={saved} preferencesReady={preferencesReady} emailOpen={emailOpen} onEmailChange={() => setEmailOpen((open) => !open)} onCancel={() => setEmailOpen(false)} />
          </form>
          {emailOpen && <ProfileEmailChange pendingEmail={pendingEmail} onClose={() => setEmailOpen(false)} />}
          {!emailOpen && pendingEmail && <p className={styles.hint} role="status">Email change awaiting confirmation: {pendingEmail}. Check both inboxes.</p>}
        </section>
        {children && <div className={styles.security}>{children}</div>}
      </div>
      <aside className={`${styles.surface} ${styles.access}`} aria-labelledby="workspace-access-heading">
        <h2 id="workspace-access-heading">Workspace access</h2>
        <dl>
          <div><dt>Workspace</dt><dd>{workspaceName}</dd></div>
          <div><dt>Role</dt><dd><Badge className={styles.role}>{roleName}</Badge></dd></div>
        </dl>
        <p className={styles.accessNote}>Managed by your organization&apos;s administrator.</p>
      </aside>
    </div>
  </main>
}

function ProfileFields({ profile, timezone, saved, preferencesReady, emailOpen, onEmailChange, onCancel }: { profile: ProfileEditorData; timezone: string; saved: boolean; preferencesReady: boolean; emailOpen: boolean; onEmailChange: () => void; onCancel: () => void }) {
  const { pending } = useFormStatus()
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [jobTitle, setJobTitle] = useState(profile.jobTitle)
  const [selectedTimezone, setSelectedTimezone] = useState(timezone)
  const [edited, setEdited] = useState(false)
  const dirty = displayName.trim() !== profile.displayName.trim() || jobTitle.trim() !== profile.jobTitle.trim() || (preferencesReady && selectedTimezone !== timezone)
  const timezones = [...new Set([timezone, "Asia/Manila", "Asia/Kuala_Lumpur", "Asia/Singapore", "Asia/Tokyo", "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Australia/Sydney"])]

  function cancel() {
    setDisplayName(profile.displayName); setJobTitle(profile.jobTitle); setSelectedTimezone(timezone)
    onCancel(); setEdited(true)
  }

  return <div className={styles.fields}>
    <div className={styles.fieldGroup}>
      <label className={styles.label} htmlFor="profile-display-name">Display name</label>
      <input id="profile-display-name" className={styles.field} name="displayName" autoComplete="name" value={displayName} onChange={(event) => { setDisplayName(event.target.value); setEdited(true) }} disabled={pending} required minLength={2} maxLength={120} />
    </div>
    <div className={styles.fieldGroup}>
      <label className={styles.label} htmlFor="profile-job-title">Job title</label>
      <input id="profile-job-title" className={styles.field} name="jobTitle" autoComplete="organization-title" value={jobTitle} onChange={(event) => { setJobTitle(event.target.value); setEdited(true) }} disabled={pending} maxLength={120} placeholder="Add your title" />
    </div>
    <div className={styles.fieldGroup}>
      <div className={styles.labelRow}>
        <label htmlFor="profile-email">Email address</label>
        <Button type="button" variant="link" className={styles.textButton} disabled={!preferencesReady || pending} aria-controls="profile-email-change" aria-expanded={emailOpen} onClick={onEmailChange}>Change email</Button>
      </div>
      <input id="profile-email" className={`${styles.field} ${styles.readonly}`} type="email" autoComplete="email" value={profile.email} readOnly aria-readonly="true" aria-describedby="profile-email-hint" />
      <p id="profile-email-hint" className={styles.hint}>Changes require email verification.</p>
    </div>
    <div className={styles.fieldGroup}>
      <label className={styles.label} htmlFor="profile-timezone">Time zone</label>
      <select id="profile-timezone" name={preferencesReady ? "timezone" : undefined} className={styles.field} value={selectedTimezone} onChange={(event) => { setSelectedTimezone(event.target.value); setEdited(true) }} disabled={pending || !preferencesReady} aria-describedby="profile-timezone-hint">
        {timezones.map((zone) => <option key={zone} value={zone}>{zone === "Asia/Manila" ? "Asia/Manila (GMT+8)" : zone}</option>)}
      </select>
      <p id="profile-timezone-hint" className={styles.hint}>{preferencesReady ? "Saved for your profile. Posting schedules use the workspace time zone." : "Apply the profile preferences migration to enable time-zone and email changes."}</p>
    </div>
    <div>
      <div className={styles.actions}>
        <Button type="submit" className={styles.saveButton} disabled={!dirty || pending} aria-busy={pending}>{pending && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}{pending ? "Saving…" : "Save changes"}</Button>
        <Button type="button" variant="ghost" className={styles.cancelButton} onClick={cancel} disabled={pending}>Cancel</Button>
      </div>
      <p className={styles.saveStatus} role="status" aria-live="polite" aria-atomic="true">{pending ? "Saving changes…" : saved && !edited ? "Saved" : ""}</p>
    </div>
  </div>
}
