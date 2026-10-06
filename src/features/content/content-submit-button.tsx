"use client"

import { useFormStatus } from "react-dom"
import type { ReactNode } from "react"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

export function ContentSubmitButton({ children, pendingLabel, disabled = false }: { children: ReactNode; pendingLabel: string; disabled?: boolean }) {
  const { pending } = useFormStatus()

  return <Button size="sm" type="submit" disabled={disabled || pending} aria-busy={pending}>
    {pending ? <><LoaderCircle aria-hidden="true" className="mr-1.5 size-3.5 animate-spin" />{pendingLabel}</> : children}
  </Button>
}
