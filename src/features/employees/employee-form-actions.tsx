"use client"

import { useFormStatus } from "react-dom"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

const labels = {
  create: { idle: "Create account", pending: "Creating account…" },
  trash: { idle: "Move to Trash", pending: "Moving to Trash…" },
}

export function EmployeeFormActions({ operation, onCancel }: {
  operation: keyof typeof labels
  onCancel?: () => void
}) {
  const { pending } = useFormStatus()
  const label = labels[operation]

  return <>
    {onCancel && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>}
    <Button type="submit" size="sm" variant={operation === "trash" ? "destructive" : "default"} disabled={pending} aria-busy={pending}>
      {pending && <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />}
      {pending ? label.pending : label.idle}
    </Button>
    <span role="status" className="sr-only">{pending ? label.pending : ""}</span>
  </>
}
