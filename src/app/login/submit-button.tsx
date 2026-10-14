"use client"

import { useFormStatus } from "react-dom"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

export function SignInSubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="h-10 w-full rounded-md"
    >
      {pending ? (
        <>
          <LoaderCircle aria-hidden="true" className="animate-spin" />
          Signing in…
        </>
      ) : (
        "Continue"
      )}
    </Button>
  )
}
