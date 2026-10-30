"use client"

import { useId, useRef, useState } from "react"

import { PasswordInput } from "@/components/ui/password-input"

export function EmployeePasswordFields({ inputClass }: { inputClass: string }) {
  const id = useId()
  const password = useRef<HTMLInputElement>(null)
  const confirmation = useRef<HTMLInputElement>(null)
  const [mismatch, setMismatch] = useState(false)
  const errorId = `${id}-error`

  function validateConfirmation() {
    const confirm = confirmation.current
    const differs = Boolean(confirm?.value && confirm.value !== password.current?.value)
    confirm?.setCustomValidity(differs ? "The passwords do not match." : "")
    setMismatch(differs)
  }

  return <>
    <div className="grid content-start gap-1 text-[11px] font-medium">
      <label htmlFor={`${id}-password`}>Initial password</label>
      <PasswordInput id={`${id}-password`} ref={password} className={inputClass} name="password" visibilityLabel="initial password" autoComplete="new-password" required minLength={8} maxLength={72} onChange={validateConfirmation} />
    </div>
    <div className="grid content-start gap-1 text-[11px] font-medium">
      <label htmlFor={`${id}-confirmation`}>Confirm password</label>
      <PasswordInput id={`${id}-confirmation`} ref={confirmation} className={inputClass} name="confirmPassword" visibilityLabel="confirm password" autoComplete="new-password" required minLength={8} maxLength={72} onChange={validateConfirmation} aria-invalid={mismatch || undefined} aria-describedby={mismatch ? errorId : undefined} />
      {mismatch && <p id={errorId} role="alert" className="text-destructive">The passwords do not match.</p>}
    </div>
  </>
}
