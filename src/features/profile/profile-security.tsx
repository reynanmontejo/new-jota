"use client"

import { useMemo, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { completePasswordChange, requestPasswordChange } from "@/app/profile/password-actions"
import { createClient as createSupabaseClient } from "@/lib/supabase/client"

type RequestInfo = { id: string; status: "pending" | "approved" | "rejected" | "completed" } | null

const inputClass = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function ProfileSecurity({ email, isAdministrator, request, requestsReady }: {
  email: string
  isAdministrator: boolean
  request: RequestInfo
  requestsReady: boolean
}) {
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseClient(), [])
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [emailCode, setEmailCode] = useState("")
  const [emailState, setEmailState] = useState<"idle" | "sent" | "unavailable">("idle")
  const [verifiedPassword, setVerifiedPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  async function prepareAdministratorChange() {
    setBusy(true)
    setMessage("")
    setEmailState("idle")
    setEmailCode("")
    setVerifiedPassword("")
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
      if (signInError) throw new Error("Current password is incorrect.")
      setVerifiedPassword(currentPassword)
      const { error: emailError } = await supabase.auth.reauthenticate()
      if (emailError) {
        setEmailState("unavailable")
        setMessage("Email confirmation is unavailable. Your current password was verified; you can continue.")
      } else {
        setEmailState("sent")
        setMessage("A verification code was sent to your account email. Enter it below to continue.")
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not verify your current password.")
    } finally { setBusy(false) }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword.length < 8 || newPassword.length > 72) {
      setMessage("Use a new password between 8 and 72 characters.")
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage("The new password and confirmation do not match.")
      return
    }
    if (isAdministrator && verifiedPassword !== currentPassword) {
      setMessage("Verify your current password and email before changing it.")
      return
    }
    if (isAdministrator && emailState === "sent" && !/^\d{6,8}$/.test(emailCode.trim())) {
      setMessage("Enter the verification code from your email.")
      return
    }

    setBusy(true)
    setMessage("")
    try {
      if (!isAdministrator) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
        if (signInError) throw new Error("Current password is incorrect.")
      }
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        ...(isAdministrator && emailState === "sent" ? { nonce: emailCode.trim() } : {}),
      })
      if (error) throw new Error(error.message)
      if (request?.status === "approved") {
        const completed = await completePasswordChange(request.id)
        setMessage(completed.ok
          ? "Password changed successfully."
          : "Password changed, but the request status could not be updated. Contact an administrator.")
      } else {
        setMessage("Password changed successfully.")
      }
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setEmailCode("")
      setEmailState("idle")
      setVerifiedPassword("")
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The password could not be changed. Check the current password and try again.")
    } finally { setBusy(false) }
  }

  return <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
    <h2 className="text-sm font-semibold">Password & security</h2>
    {isAdministrator ? <>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Verify your current password. If email confirmation is available, a code is required before the change.</p>
      <form onSubmit={changePassword} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[11px] font-medium">Current password
          <input className={inputClass} type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setVerifiedPassword(""); setEmailState("idle"); setEmailCode("") }} required minLength={1} maxLength={72} />
        </label>
        <div className="flex items-end"><Button type="button" variant="outline" size="sm" disabled={busy || !currentPassword} onClick={() => void prepareAdministratorChange()}>{busy ? "Verifying…" : "Verify & email code"}</Button></div>
        <label className="grid gap-1 text-[11px] font-medium">New password
          <input className={inputClass} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} maxLength={72} />
        </label>
        <label className="grid gap-1 text-[11px] font-medium">Confirm new password
          <input className={inputClass} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} maxLength={72} />
        </label>
        {emailState === "sent" && <label className="grid gap-1 text-[11px] font-medium sm:col-span-2">Email verification code
          <input className={inputClass} inputMode="numeric" autoComplete="one-time-code" value={emailCode} onChange={(event) => setEmailCode(event.target.value)} required pattern="[0-9]{6,8}" maxLength={8} />
        </label>}
        <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={busy || !verifiedPassword || (emailState === "sent" && !emailCode)}>{busy ? "Saving…" : "Change password"}</Button></div>
      </form>
    </> : !requestsReady ? <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">Password requests are unavailable until the latest profile/security migration is applied.</p>
      : request?.status === "pending" ? <p className="mt-2 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">Your request is waiting for an administrator’s approval. No password has been shared.</p>
        : request?.status === "approved" ? <>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Your request was approved. Change your password here; it is sent directly to Supabase Auth and is never shown to your administrator.</p>
          <form onSubmit={changePassword} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[11px] font-medium">Current password
              <input className={inputClass} type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required minLength={1} maxLength={72} />
            </label>
            <label className="grid gap-1 text-[11px] font-medium">New password
              <input className={inputClass} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} maxLength={72} />
            </label>
            <label className="grid gap-1 text-[11px] font-medium">Confirm new password
              <input className={inputClass} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} maxLength={72} />
            </label>
            <div className="flex items-end"><Button type="submit" size="sm" disabled={busy || !currentPassword}>{busy ? "Changing…" : "Change password"}</Button></div>
          </form>
        </> : <>
          {request?.status === "rejected" && <p className="mt-2 text-xs text-muted-foreground">Your last request was declined. You can submit another request if you still need help.</p>}
          {request?.status === "completed" && <p className="mt-2 text-xs text-muted-foreground">Your approved password change was completed.</p>}
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Ask an administrator to approve a password change. Passwords are not included in the request.</p>
          <form action={requestPasswordChange} className="mt-3 grid gap-2">
            <label className="grid gap-1 text-[11px] font-medium">Reason <span className="font-normal text-muted-foreground">(optional)</span>
              <input className={inputClass} name="requestNote" maxLength={500} placeholder="Briefly explain why you need to change it" />
            </label>
            <div><Button type="submit" size="sm">Request approval</Button></div>
          </form>
        </>}
    {message && <p role="status" className="mt-3 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">{message}</p>}
  </section>
}
