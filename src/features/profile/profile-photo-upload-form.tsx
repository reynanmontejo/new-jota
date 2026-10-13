"use client"

import { useState } from "react"
import { useFormStatus } from "react-dom"
import { ImagePlus, LoaderCircle, Upload } from "lucide-react"

import { uploadProfilePhoto } from "@/app/profile/actions"
import { Button } from "@/components/ui/button"

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"])
const maximumBytes = 5 * 1024 * 1024

export function ProfilePhotoUploadForm() {
  const [fileName, setFileName] = useState("")
  const [selectionError, setSelectionError] = useState("")

  function selectFile(file: File | undefined) {
    setSelectionError("")
    setFileName(file?.name ?? "")
    if (!file) return
    if (!allowedTypes.has(file.type) || file.size < 1 || file.size > maximumBytes) {
      setSelectionError("Choose a JPG, PNG, or WEBP image up to 5 MB.")
    }
  }

  return (
    <div className="min-w-0">
      <form action={uploadProfilePhoto} className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center">
        <label className="relative flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-primary/30 bg-background/65 px-3 py-2.5 transition hover:border-primary/55 hover:bg-background focus-within:ring-2 focus-within:ring-ring">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><ImagePlus className="size-4" /></span>
          <span className="min-w-0"><span className="block text-xs font-semibold">Choose image</span><span className="block truncate text-[11px] text-muted-foreground">{fileName || "JPG, PNG, or WEBP · up to 5 MB"}</span></span>
          <input className="absolute inset-0 cursor-pointer opacity-0" type="file" name="photo" accept="image/jpeg,image/png,image/webp" required aria-label="Choose a profile picture" onChange={(event) => selectFile(event.currentTarget.files?.[0])} />
        </label>
        <UploadButton disabled={!fileName || Boolean(selectionError)} />
      </form>
      {selectionError && <p role="alert" className="mt-1.5 text-xs text-destructive">{selectionError}</p>}
    </div>
  )
}

function UploadButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={disabled || pending} className="shrink-0">
      {pending ? <><LoaderCircle className="animate-spin" />Uploading…</> : <><Upload />Upload photo</>}
    </Button>
  )
}
