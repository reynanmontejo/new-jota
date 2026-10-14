"use client"

import { useEffect, useRef, useState, useTransition, type PointerEvent } from "react"
import { ImagePlus, LoaderCircle, Upload, X, ZoomIn } from "lucide-react"

import { uploadProfilePhoto } from "@/app/profile/actions"
import { Button } from "@/components/ui/button"

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"])
const maximumBytes = 5 * 1024 * 1024
const outputSize = 512

type CropView = {
  viewport: number
  scale: number
  width: number
  height: number
  left: number
  top: number
  zoom: number
}

export function ProfilePhotoUploadForm() {
  const inputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const dragStart = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState("")
  const [selectionError, setSelectionError] = useState("")
  const [crop, setCrop] = useState<CropView>({ viewport: 0, scale: 0, width: 0, height: 0, left: 0, top: 0, zoom: 1 })
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (previewUrl && !dialog.open) dialog.showModal()
    else if (!previewUrl && dialog.open) dialog.close()
  }, [previewUrl])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  function selectFile(candidate?: File) {
    setSelectionError("")
    if (!candidate) return
    if (!allowedTypes.has(candidate.type) || candidate.size < 1 || candidate.size > maximumBytes) {
      setFile(null)
      setPreviewUrl("")
      setSelectionError("Choose a JPG, PNG, or WEBP image up to 5 MB.")
      return
    }
    setFile(candidate)
    setCrop({ viewport: 0, scale: 0, width: 0, height: 0, left: 0, top: 0, zoom: 1 })
    setPreviewUrl(URL.createObjectURL(candidate))
  }

  function initializeCrop() {
    const image = imageRef.current
    const viewport = stageRef.current?.clientWidth ?? 0
    if (!image?.naturalWidth || !image.naturalHeight || !viewport) return
    const scale = Math.max(viewport / image.naturalWidth, viewport / image.naturalHeight)
    const width = image.naturalWidth * scale
    const height = image.naturalHeight * scale
    setCrop({ viewport, scale, width, height, left: (viewport - width) / 2, top: (viewport - height) / 2, zoom: 1 })
  }

  function updateZoom(zoom: number) {
    const image = imageRef.current
    if (!image?.naturalWidth || !crop.viewport || !crop.scale) return
    const nextScale = Math.max(crop.viewport / image.naturalWidth, crop.viewport / image.naturalHeight) * zoom
    const width = image.naturalWidth * nextScale
    const height = image.naturalHeight * nextScale
    const sourceX = (crop.viewport / 2 - crop.left) / crop.scale
    const sourceY = (crop.viewport / 2 - crop.top) / crop.scale
    const left = clamp(crop.viewport / 2 - sourceX * nextScale, crop.viewport - width, 0)
    const top = clamp(crop.viewport / 2 - sourceY * nextScale, crop.viewport - height, 0)
    setCrop({ viewport: crop.viewport, scale: nextScale, width, height, left, top, zoom })
  }

  function startDragging(event: PointerEvent<HTMLDivElement>) {
    if (!crop.viewport || pending) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: crop.left, top: crop.top }
  }

  function drag(event: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current
    if (!start || start.pointerId !== event.pointerId) return
    setCrop((current) => ({
      ...current,
      left: clamp(start.left + event.clientX - start.x, current.viewport - current.width, 0),
      top: clamp(start.top + event.clientY - start.y, current.viewport - current.height, 0),
    }))
  }

  async function saveCroppedPhoto() {
    const image = imageRef.current
    if (!file || !image?.naturalWidth || !crop.viewport) return
    setSelectionError("")
    try {
      const canvas = document.createElement("canvas")
      canvas.width = outputSize
      canvas.height = outputSize
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Your browser could not prepare this image. Try another file.")
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, outputSize, outputSize)
      const ratio = outputSize / crop.viewport
      context.drawImage(image, crop.left * ratio, crop.top * ratio, crop.width * ratio, crop.height * ratio)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error("The cropped image could not be prepared.")), "image/jpeg", 0.9)
      })
      const formData = new FormData()
      formData.set("photo", new File([blob], "profile-picture.jpg", { type: "image/jpeg" }))
      startTransition(async () => { await uploadProfilePhoto(formData) })
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Could not prepare the cropped image.")
    }
  }

  function closeCrop() {
    setFile(null)
    setPreviewUrl("")
    setSelectionError("")
    setCrop({ viewport: 0, scale: 0, width: 0, height: 0, left: 0, top: 0, zoom: 1 })
  }

  return (
    <div className="min-w-0">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Choose a profile picture"
        onChange={(event) => {
          selectFile(event.currentTarget.files?.[0])
          event.currentTarget.value = ""
        }}
      />
      <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-dashed border-primary/30 bg-background/65 px-3 py-2.5 text-left transition hover:border-primary/55 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => inputRef.current?.click()}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><ImagePlus className="size-4" /></span>
          <span className="min-w-0"><span className="block text-xs font-semibold">Choose image</span><span className="block truncate text-[11px] text-muted-foreground">JPG, PNG, or WEBP · up to 5 MB</span></span>
        </button>
        {file && <span className="max-w-full truncate text-xs text-muted-foreground" title={file.name}>{file.name}</span>}
      </div>
      {selectionError && <p role="alert" className="mt-1.5 text-xs text-destructive">{selectionError}</p>}

      <dialog
        ref={dialogRef}
        aria-labelledby="profile-photo-dialog-title"
        aria-describedby="profile-photo-dialog-description"
        onCancel={(event) => { event.preventDefault(); closeCrop() }}
        onClose={() => { if (previewUrl) closeCrop() }}
        className="m-auto w-[min(92vw,28rem)] max-w-none rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/60"
      >
        {previewUrl && <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="profile-photo-dialog-title" className="text-base font-semibold">Adjust profile picture</h2>
              <p id="profile-photo-dialog-description" className="mt-1 text-xs text-muted-foreground">Drag to reposition, then zoom in or out. The circular preview shows what teammates will see.</p>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel profile picture change" disabled={pending} onClick={closeCrop}><X /></Button>
          </div>

          <div className="mx-auto mt-5 w-full max-w-[18rem]">
            <div
              ref={stageRef}
              className="relative aspect-square w-full touch-none overflow-hidden rounded-full border-4 border-background bg-muted shadow-[0_0_0_1px_var(--border)] cursor-grab active:cursor-grabbing"
              onPointerDown={startDragging}
              onPointerMove={drag}
              onPointerUp={() => { dragStart.current = null }}
              onPointerCancel={() => { dragStart.current = null }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                src={previewUrl}
                alt="Profile picture crop preview"
                draggable={false}
                onLoad={initializeCrop}
                className="pointer-events-none absolute max-w-none select-none"
                style={{ width: crop.width || undefined, height: crop.height || undefined, left: crop.left, top: crop.top }}
              />
            </div>
          </div>

          <label className="mx-auto mt-4 flex w-full max-w-[18rem] items-center gap-3 text-xs text-muted-foreground">
            <ZoomIn className="size-4 shrink-0" />
            <span className="sr-only">Zoom profile picture</span>
            <input className="w-full accent-primary" type="range" min="1" max="3" step="0.01" value={crop.zoom} onChange={(event) => updateZoom(Number(event.currentTarget.value))} aria-label="Zoom profile picture" />
          </label>
          {selectionError && <p role="alert" className="mt-3 text-xs text-destructive">{selectionError}</p>}
          <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={closeCrop}>Cancel</Button>
            <Button type="button" size="sm" disabled={pending || !crop.viewport} onClick={() => void saveCroppedPhoto()}>
              {pending ? <><LoaderCircle className="animate-spin" />Saving...</> : <><Upload />Save picture</>}
            </Button>
          </div>
        </div>}
      </dialog>
    </div>
  )
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
