import { Ban, CircleAlert, CloudUpload, FileQuestion, LoaderCircle, UserX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ContentStateProps = {
  variant: "loading" | "empty" | "error" | "access_denied" | "deactivated"
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  compact?: boolean
}

const stateDefaults = {
  loading: { title: "Loading workspace", description: "Gathering the latest client work.", icon: LoaderCircle },
  empty: { title: "Nothing here yet", description: "New work will appear here when it is created.", icon: FileQuestion },
  error: { title: "We couldn’t load this", description: "Try again. Your existing work is safe.", icon: CircleAlert },
  access_denied: { title: "Access denied", description: "You don’t have permission to view this workspace.", icon: Ban },
  deactivated: { title: "Account deactivated", description: "Contact an administrator to restore access.", icon: UserX },
}

export function ContentState({ variant, title, description, actionLabel, onAction, compact = false }: ContentStateProps) {
  const defaults = stateDefaults[variant]
  const Icon = defaults.icon

  return (
    <div className={cn("glass-panel flex flex-col items-center justify-center rounded-2xl border px-6 text-center", compact ? "min-h-48 py-8" : "min-h-[420px] py-14")}>
      <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-secondary/35 to-accent/45 text-primary shadow-[0_12px_24px_-16px_rgb(94_70_41/55%)]">
        <Icon className={cn("size-5", variant === "loading" && "animate-spin")} />
      </span>
      <h2 className="mt-4 text-base font-semibold">{title ?? defaults.title}</h2>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description ?? defaults.description}</p>
      {actionLabel && onAction && <Button className="mt-5" onClick={onAction}>{actionLabel}</Button>}
    </div>
  )
}

type UploadProgressProps = {
  fileName: string
  progress: number
  status: "uploading" | "complete" | "error"
  onRetry?: () => void
  onCancel?: () => void
  errorMessage?: string
}

export function UploadProgress({ fileName, progress, status, onRetry, onCancel, errorMessage }: UploadProgressProps) {
  if (status === "complete") return null

  return (
    <div className={cn("rounded-xl border p-3", status === "error" ? "border-destructive/35 bg-destructive/5" : "border-primary/20 bg-background/65")}>
      <div className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary/30 text-primary"><CloudUpload className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-semibold">{fileName}</span>
            <span className={status === "error" ? "text-destructive" : "text-muted-foreground"}>{status === "error" ? "Failed" : `${progress}%`}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary/25">
            <div className={cn("h-full rounded-full transition-[width] duration-300", status === "error" ? "bg-destructive" : "bg-gradient-to-r from-primary to-accent")} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
      {status === "error" && (
        <div className="mt-2 flex items-center justify-between pl-11 text-xs">
          <span className="text-muted-foreground">{errorMessage ?? "File exceeds the 10 MB mock upload limit."}</span>
          {onRetry && <button className="font-semibold text-primary hover:underline" onClick={onRetry}>Try another file</button>}
        </div>
      )}
      {status === "uploading" && onCancel && <div className="mt-2 flex justify-end pl-11 text-xs"><button className="font-medium text-muted-foreground hover:text-foreground" onClick={onCancel}>Cancel upload</button></div>}
    </div>
  )
}
