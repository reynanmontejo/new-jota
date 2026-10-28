"use client"

import { useFormStatus } from "react-dom"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

export function CreateClientSubmitButton() {
  const { pending } = useFormStatus()

  return <Button type="submit" size="sm" className="w-full" disabled={pending} aria-busy={pending}>
    {pending ? <><LoaderCircle aria-hidden="true" className="animate-spin" />Creating client…</> : "Create client"}
  </Button>
}
