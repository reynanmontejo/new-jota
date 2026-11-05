"use client"

import { useActionState, useEffect, useRef } from "react"
import { requestOwnEmailChange } from "@/app/profile/email-actions"
import { Button } from "@/components/ui/button"
import styles from "@/features/profile/profile.module.css"

export function ProfileEmailChange({ pendingEmail, onClose }: { pendingEmail?: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(requestOwnEmailChange, { ok: false, message: "" })
  const emailInput = useRef<HTMLInputElement>(null)
  useEffect(() => { emailInput.current?.focus() }, [])
  return <section id="profile-email-change" className={styles.emailPanel} aria-labelledby="profile-email-change-title">
    <h3 id="profile-email-change-title">Change email</h3>
    <p className={styles.hint}>Follow the confirmation links sent to your inboxes. Your current address stays in use until verification is complete. You may need to confirm both inboxes.</p>
    {pendingEmail && <p className={styles.hint}>Awaiting confirmation: {pendingEmail}. Enter this address below to request fresh links.</p>}
    <form action={action} className={styles.fieldGroup}>
      <label className={styles.label} htmlFor="profile-new-email">New email address</label>
      <input ref={emailInput} id="profile-new-email" name="email" type="email" autoComplete="email" className={styles.field} required maxLength={254} disabled={pending} />
      <label className={styles.label} htmlFor="profile-confirm-email">Confirm new email address</label>
      <input id="profile-confirm-email" name="confirmEmail" type="email" autoComplete="email" className={styles.field} required maxLength={254} disabled={pending} />
      <div className={styles.actions}>
        <Button className={styles.saveButton} type="submit" disabled={pending} aria-busy={pending}>{pending ? "Sending…" : "Send verification"}</Button>
        <Button className={styles.cancelButton} type="button" variant="ghost" onClick={onClose} disabled={pending}>Close</Button>
      </div>
      <p role={state.message && !state.ok ? "alert" : "status"} aria-live="polite" className={styles.hint}>{state.message}</p>
    </form>
  </section>
}
